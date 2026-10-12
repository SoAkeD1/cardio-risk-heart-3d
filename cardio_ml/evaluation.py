"""Validation machinery: splits, nested CV with Optuna, fixed-config CV, metrics, bootstrap CIs.

All CV functions take precomputed ``splits`` so every model / strategy / ablation is compared
on exactly the same folds.
"""
from __future__ import annotations

import hashlib
import json
import warnings
from dataclasses import dataclass, field
from typing import Callable

import joblib
import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import (RepeatedStratifiedKFold, StratifiedKFold, cross_val_predict,
                                     train_test_split)

from . import config as C
from .data import assert_no_leakage
from .models import REGISTRY, ModelConfig, build_pipeline

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


# ============================================================================ splits
def holdout_split(y_cad: pd.Series, test_size=C.TEST_SIZE, seed=C.SEED):
    idx = np.arange(len(y_cad))
    tr, te = train_test_split(idx, test_size=test_size, stratify=y_cad, random_state=seed)
    return np.sort(tr), np.sort(te)


def outer_splits(strat: np.ndarray, n_splits=C.CV_SPLITS, n_repeats=C.CV_REPEATS, seed=C.SEED):
    """Repeated stratified K-fold. ``strat`` = number of stenotic vessels (0-3), which also
    stratifies CAD and keeps every vessel target balanced across folds."""
    rskf = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=seed)
    return list(rskf.split(np.zeros(len(strat)), strat))


# ============================================================================ metrics
def best_f1_threshold(y, p) -> float:
    grid = np.linspace(0.05, 0.95, 181)
    f1s = [f1_score(y, (p >= t).astype(int), zero_division=0) for t in grid]
    return float(grid[int(np.argmax(f1s))])


def youden_threshold(y, p) -> float:
    fpr, tpr, thr = roc_curve(y, p)
    return float(np.clip(thr[int(np.argmax(tpr - fpr))], 0, 1))


def sensitivity_threshold(y, p, min_recall=0.90) -> float:
    """Largest threshold whose recall is still >= min_recall."""
    fpr, tpr, thr = roc_curve(y, p)
    ok = np.where(tpr >= min_recall)[0]
    return float(np.clip(thr[ok[0]], 0, 1))


def specificity_threshold(y, p, min_spec=0.90) -> float:
    """Smallest threshold whose specificity is >= min_spec."""
    fpr, tpr, thr = roc_curve(y, p)
    ok = np.where(1 - fpr >= min_spec)[0]
    return float(np.clip(thr[ok[-1]], 0, 1))


def ece(y, p, n_bins=10) -> float:
    bins = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, bins) - 1, 0, n_bins - 1)
    return float(sum(abs(y[idx == b].mean() - p[idx == b].mean()) * (idx == b).mean()
                     for b in range(n_bins) if (idx == b).any()))


def metrics_at(y, p, thr) -> dict:
    y = np.asarray(y)
    p = np.asarray(p)
    yhat = (p >= thr).astype(int)
    return dict(
        auc=roc_auc_score(y, p) if len(np.unique(y)) > 1 else np.nan,
        pr_auc=average_precision_score(y, p) if len(np.unique(y)) > 1 else np.nan,
        f1=f1_score(y, yhat, zero_division=0), accuracy=accuracy_score(y, yhat),
        precision=precision_score(y, yhat, zero_division=0),
        recall=recall_score(y, yhat, zero_division=0),
        specificity=recall_score(1 - y, 1 - yhat, zero_division=0),
        brier=brier_score_loss(y, p), threshold=float(thr))


def bootstrap_ci(y, p, thr, n_boot=C.N_BOOTSTRAP, seed=C.SEED) -> dict:
    """Point estimate + 95 % percentile bootstrap CI (stratified resampling) for each metric."""
    rng = np.random.default_rng(seed)
    y = np.asarray(y)
    p = np.asarray(p)
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    rows = []
    for _ in range(n_boot):
        b = np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))])
        rows.append(metrics_at(y[b], p[b], thr))
    boot = pd.DataFrame(rows)
    point = metrics_at(y, p, thr)
    return {k: dict(value=float(point[k]), ci_low=float(boot[k].quantile(0.025)),
                    ci_high=float(boot[k].quantile(0.975)))
            for k in point if k != "threshold"}


# ============================================================================ results
@dataclass
class CVResult:
    """Fold-level outputs of one model/config on a list of outer splits."""
    name: str
    n: int
    splits: list
    test_probs: list = field(default_factory=list)   # per fold, aligned with splits[i][1]
    inner_oof: list = field(default_factory=list)    # per fold, aligned with splits[i][0]
    thresholds: list = field(default_factory=list)
    params: list = field(default_factory=list)

    def fold_metrics(self, y) -> pd.DataFrame:
        y = np.asarray(y)
        return pd.DataFrame([metrics_at(y[te], p, t) for (_, te), p, t
                             in zip(self.splits, self.test_probs, self.thresholds)])

    def summary(self, y) -> dict:
        fm = self.fold_metrics(y)
        out = {}
        for k in ["auc", "pr_auc", "f1", "accuracy", "precision", "recall", "brier"]:
            out[f"{k}_mean"] = float(fm[k].mean())
            out[f"{k}_std"] = float(fm[k].std())
        return out

    def pooled(self, y):
        """All out-of-fold predictions concatenated over repeats -> (y, p)."""
        y = np.asarray(y)
        ys = np.concatenate([y[te] for _, te in self.splits])
        ps = np.concatenate(self.test_probs)
        return ys, ps

    def mean_oof(self) -> np.ndarray:
        """Per-patient OOF probability averaged over repeats."""
        acc, cnt = np.zeros(self.n), np.zeros(self.n)
        for (_, te), p in zip(self.splits, self.test_probs):
            acc[te] += p
            cnt[te] += 1
        return acc / np.maximum(cnt, 1)


# ============================================================================ tuning
def _cv_auc(make: Callable, X, y, cv) -> float:
    aucs = []
    for tr, va in cv.split(X, y):
        m = make().fit(X.iloc[tr], y[tr])
        aucs.append(roc_auc_score(y[va], m.predict_proba(X.iloc[va])[:, 1]))
    return float(np.mean(aucs))


def tune(name: str, X: pd.DataFrame, y, n_trials=C.N_TRIALS, n_splits=C.INNER_SPLITS,
         seed=C.SEED, pipe_kwargs: dict | None = None) -> dict:
    """Optuna TPE search maximising inner-CV ROC-AUC. Returns best params ({} if untunable)."""
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    spec = REGISTRY[name]
    if not spec.tunable or n_trials <= 0:
        return {}
    y = np.asarray(y)
    cv = StratifiedKFold(n_splits, shuffle=True, random_state=seed)
    pipe_kwargs = pipe_kwargs or {}

    def objective(trial):
        params = spec.space(trial)
        return _cv_auc(lambda: build_pipeline(name, params, **pipe_kwargs), X, y, cv)

    study = optuna.create_study(direction="maximize",
                                sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    return study.best_params


def inner_oof(make: Callable, X, y, n_splits=C.OOF_SPLITS, seed=C.SEED) -> np.ndarray:
    cv = StratifiedKFold(n_splits, shuffle=True, random_state=seed)
    return cross_val_predict(make(), X, np.asarray(y), cv=cv, method="predict_proba")[:, 1]


# ============================================================================ nested CV
def _nested_fold(name, X, y, tr, te, n_trials, pipe_kwargs, seed):
    Xtr, ytr = X.iloc[tr], y[tr]
    assert_no_leakage(Xtr)
    params = tune(name, Xtr, ytr, n_trials=n_trials, seed=seed, pipe_kwargs=pipe_kwargs)
    make = lambda: build_pipeline(name, params, **pipe_kwargs)   # noqa: E731
    oof = inner_oof(make, Xtr, ytr, seed=seed)
    thr = best_f1_threshold(ytr, oof)
    p = make().fit(Xtr, ytr).predict_proba(X.iloc[te])[:, 1]
    return p, oof, thr, params


def nested_cv(name: str, X: pd.DataFrame, y, splits, n_trials=C.N_TRIALS,
              pipe_kwargs: dict | None = None, n_jobs=C.N_JOBS, cache_key: str | None = None):
    """Nested CV: Optuna tuning on the inner 3 folds of every outer-train split, threshold from
    inner 5-fold OOF, evaluation on the untouched outer-test split."""
    def run():
        y_ = np.asarray(y)
        outs = Parallel(n_jobs=n_jobs)(
            delayed(_nested_fold)(name, X, y_, tr, te, n_trials, pipe_kwargs or {}, C.SEED + i)
            for i, (tr, te) in enumerate(splits))
        res = CVResult(name, len(X), splits)
        for p, oof, thr, params in outs:
            res.test_probs.append(p)
            res.inner_oof.append(oof)
            res.thresholds.append(thr)
            res.params.append(params)
        return res
    return cached(cache_key, run) if cache_key else run()


def ensemble_from_members(members: list[CVResult], y, kind="vote") -> CVResult:
    """Soft-vote / stacking estimates from members' nested-CV outputs on identical splits.
    Stacking meta-learner (LR) is trained on the members' INNER out-of-fold predictions only."""
    y = np.asarray(y)
    base = members[0]
    res = CVResult(f"{kind}(" + "+".join(m.name for m in members) + ")", base.n, base.splits)
    for i, (tr, te) in enumerate(base.splits):
        Ptr = np.column_stack([m.inner_oof[i] for m in members])
        Pte = np.column_stack([m.test_probs[i] for m in members])
        if kind == "vote":
            oof, p = Ptr.mean(1), Pte.mean(1)
        else:
            meta = LogisticRegression(C=1.0, max_iter=1000)
            oof = cross_val_predict(meta, Ptr, y[tr], method="predict_proba",
                                    cv=StratifiedKFold(C.OOF_SPLITS, shuffle=True,
                                                       random_state=C.SEED))[:, 1]
            p = meta.fit(Ptr, y[tr]).predict_proba(Pte)[:, 1]
        res.test_probs.append(p)
        res.inner_oof.append(oof)
        res.thresholds.append(best_f1_threshold(y[tr], oof))
        res.params.append({})
    return res


# ============================================================================ fixed-config CV
def _fixed_fold(make, X, y, tr, te, with_oof):
    Xtr, ytr = X.iloc[tr], y[tr]
    assert_no_leakage(Xtr)
    oof = inner_oof(make, Xtr, ytr) if with_oof else None
    thr = best_f1_threshold(ytr, oof) if with_oof else 0.5
    p = make().fit(Xtr, ytr).predict_proba(X.iloc[te])[:, 1]
    return p, oof, thr


def cv_fixed(make: Callable, X, y, splits, name="model", with_oof=True, n_jobs=C.N_JOBS,
             cache_key: str | None = None) -> CVResult:
    """Outer CV of a fixed (untuned) configuration; ``make()`` returns a fresh estimator."""
    def run():
        y_ = np.asarray(y)
        outs = Parallel(n_jobs=n_jobs)(delayed(_fixed_fold)(make, X, y_, tr, te, with_oof)
                                       for tr, te in splits)
        res = CVResult(name, len(X), splits)
        for p, oof, thr in outs:
            res.test_probs.append(p)
            res.inner_oof.append(oof)
            res.thresholds.append(thr)
            res.params.append({})
        return res
    return cached(cache_key, run) if cache_key else run()


def calibrated(make: Callable, method: str | None):
    """Factory wrapper: CalibratedClassifierCV(ensemble=False) -> ONE refitted pipeline + ONE
    calibrator fitted on its 5-fold cross-validated predictions."""
    if method is None:
        return make
    return lambda: CalibratedClassifierCV(
        make(), method=method, ensemble=False,
        cv=StratifiedKFold(C.OOF_SPLITS, shuffle=True, random_state=C.SEED))


# ============================================================================ selection
def select_best(table: pd.DataFrame, tol=C.SELECTION_TOL) -> str:
    """Lexicographic with tolerances: AUC, then F1, then (lower) Brier, then simplicity.
    ``table`` index = model label; needs auc_mean, f1_mean, brier_mean, complexity."""
    t = table[table.auc_mean >= table.auc_mean.max() - tol["auc"]]
    t = t[t.f1_mean >= t.f1_mean.max() - tol["f1"]]
    t = t[t.brier_mean <= t.brier_mean.min() + tol["brier"]]
    return t.sort_values(["complexity", "auc_mean"], ascending=[True, False]).index[0]


# ============================================================================ caching
def config_fingerprint() -> str:
    keys = dict(fast=C.FAST_MODE, seed=C.SEED, rep=C.CV_REPEATS, spl=C.CV_SPLITS,
                trials=C.N_TRIALS, final=C.FINAL_TRIALS, inner=C.INNER_SPLITS)
    return hashlib.md5(json.dumps(keys, sort_keys=True).encode()).hexdigest()[:8]


def cached(key: str, fn: Callable):
    """Disk cache for expensive CV results (artifacts/cache). Delete the folder to recompute."""
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = C.CACHE_DIR / f"{key}_{config_fingerprint()}.joblib"
    if path.exists():
        return joblib.load(path)
    out = fn()
    joblib.dump(out, path)
    return out


# ============================================================================ final training
def tune_members(jobs: list[tuple], n_trials=C.FINAL_TRIALS, n_splits=C.OOF_SPLITS,
                 n_jobs=C.N_JOBS) -> list[dict]:
    """jobs: [(model_name, X, y, pipe_kwargs)] -> best params for each (tuned in parallel)."""
    return Parallel(n_jobs=n_jobs)(
        delayed(tune)(name, X, y, n_trials, n_splits, C.SEED, pk) for name, X, y, pk in jobs)
