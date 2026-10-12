"""Model registry (name -> builder + Optuna search space) and pipeline factories.

Every pipeline has the same shape so that explanation code can walk it:

    Pipeline([encode, engineer, (select), model])
        model = member sub-pipeline              (single model)
              | VotingClassifier / StackingClassifier of member sub-pipelines (ensembles)
    member sub-pipeline = [drop, log1p, scale]  (linear / kernel models only)
                          + [smote]             (optional variant)
                          + estimator

To add a model: add one ``ModelSpec`` to ``REGISTRY``. Nothing else changes.
"""
from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import (ExtraTreesClassifier, RandomForestClassifier, StackingClassifier,
                              VotingClassifier)
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC

from . import config as C
from .features import (ClinicalEncoder, ClinicalFeatureEngineer, ColumnDropper, FrameScaler,
                       L1Selector, Log1pTransformer, ShapTopKSelector)


# ============================================================================ wrappers
class EarlyStoppedLGBM(ClassifierMixin, BaseEstimator):
    """LightGBM with early stopping on an internal stratified validation split of the training
    data it is given (so early stopping happens inside every inner/outer CV fold), then a refit on
    all of that training data with the best number of rounds."""

    def __init__(self, num_leaves=7, min_child_samples=20, subsample=0.8, colsample_bytree=0.8,
                 reg_alpha=0.1, reg_lambda=1.0, learning_rate=0.03, max_estimators=1000,
                 early_stopping_rounds=50, val_fraction=0.2, random_state=C.SEED):
        self.num_leaves = num_leaves
        self.min_child_samples = min_child_samples
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.reg_alpha = reg_alpha
        self.reg_lambda = reg_lambda
        self.learning_rate = learning_rate
        self.max_estimators = max_estimators
        self.early_stopping_rounds = early_stopping_rounds
        self.val_fraction = val_fraction
        self.random_state = random_state

    def _make(self, n_estimators):
        import lightgbm as lgb
        return lgb.LGBMClassifier(
            n_estimators=n_estimators, num_leaves=self.num_leaves,
            min_child_samples=self.min_child_samples, subsample=self.subsample, subsample_freq=1,
            colsample_bytree=self.colsample_bytree, reg_alpha=self.reg_alpha,
            reg_lambda=self.reg_lambda, learning_rate=self.learning_rate, metric="auc",
            class_weight="balanced", random_state=self.random_state, n_jobs=1, verbose=-1)

    def fit(self, X, y):
        import lightgbm as lgb
        y = np.asarray(y)
        self.classes_ = np.unique(y)
        Xtr, Xva, ytr, yva = train_test_split(X, y, test_size=self.val_fraction, stratify=y,
                                              random_state=self.random_state)
        probe = self._make(self.max_estimators)
        probe.fit(Xtr, ytr, eval_set=[(Xva, yva)],
                  callbacks=[lgb.early_stopping(self.early_stopping_rounds, verbose=False)])
        self.best_iteration_ = int(max(20, probe.best_iteration_ or self.max_estimators))
        self.model_ = self._make(self.best_iteration_).fit(X, y)
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(X)

    def predict(self, X):
        return self.classes_[(self.predict_proba(X)[:, 1] >= 0.5).astype(int)]


class BalancedXGB(ClassifierMixin, BaseEstimator):
    """XGBoost with scale_pos_weight = n_neg / n_pos computed on the training fold."""

    def __init__(self, max_depth=3, learning_rate=0.05, n_estimators=300, subsample=0.8,
                 colsample_bytree=0.8, min_child_weight=3, reg_lambda=5.0, reg_alpha=0.1,
                 gamma=0.5, random_state=C.SEED):
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.n_estimators = n_estimators
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.min_child_weight = min_child_weight
        self.reg_lambda = reg_lambda
        self.reg_alpha = reg_alpha
        self.gamma = gamma
        self.random_state = random_state

    def fit(self, X, y):
        from xgboost import XGBClassifier
        y = np.asarray(y)
        self.classes_ = np.unique(y)
        spw = float((y == 0).sum()) / max(1.0, float((y == 1).sum()))
        self.model_ = XGBClassifier(
            max_depth=self.max_depth, learning_rate=self.learning_rate,
            n_estimators=self.n_estimators, subsample=self.subsample,
            colsample_bytree=self.colsample_bytree, min_child_weight=self.min_child_weight,
            reg_lambda=self.reg_lambda, reg_alpha=self.reg_alpha, gamma=self.gamma,
            scale_pos_weight=spw, eval_metric="logloss", tree_method="hist",
            random_state=self.random_state, n_jobs=1)
        self.model_.fit(X, y)
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(X)

    def predict(self, X):
        return self.classes_[(self.predict_proba(X)[:, 1] >= 0.5).astype(int)]


# ============================================================================ registry
@dataclass
class ModelSpec:
    name: str
    kind: str                 # linear | kernel | tree | pfn   (drives preprocessing + explainer)
    family: str               # diversity family for ensemble selection
    build: Callable[[dict], object]
    space: Callable[[object], dict]
    defaults: dict = field(default_factory=dict)
    complexity: int = 1       # tie-break: simpler first

    @property
    def scaled(self) -> bool:
        return self.kind in {"linear", "kernel"}

    @property
    def tunable(self) -> bool:
        return self.kind != "pfn"


def _lr(p):
    return LogisticRegression(solver="saga", class_weight="balanced", max_iter=10000,
                              random_state=C.SEED, **p)


def _svm(p):
    return SVC(kernel="rbf", probability=True, class_weight="balanced", random_state=C.SEED, **p)


def _rf(p):
    return RandomForestClassifier(class_weight="balanced_subsample", n_jobs=1,
                                  random_state=C.SEED, **p)


def _et(p):
    return ExtraTreesClassifier(class_weight="balanced_subsample", n_jobs=1,
                                random_state=C.SEED, **p)


def _cat(p):
    from catboost import CatBoostClassifier
    return CatBoostClassifier(auto_class_weights="Balanced", random_seed=C.SEED, verbose=0,
                              thread_count=1, allow_writing_files=False, **p)


def _tabpfn(p):
    from tabpfn import TabPFNClassifier
    return TabPFNClassifier(device="cpu", random_state=C.SEED, **p)


def _forest_space(t):
    return dict(n_estimators=t.suggest_int("n_estimators", 200, 500, step=100),
                min_samples_leaf=t.suggest_int("min_samples_leaf", 3, 10),
                max_features=t.suggest_categorical("max_features", ["sqrt", 0.3, 0.5]),
                max_depth=t.suggest_categorical("max_depth", [None, 4, 6, 8, 12]))


REGISTRY: dict[str, ModelSpec] = {
    "lr": ModelSpec(
        "lr", "linear", "linear", _lr,
        lambda t: dict(C=t.suggest_float("C", 1e-3, 10, log=True),
                       l1_ratio=t.suggest_float("l1_ratio", 0.0, 1.0)),
        defaults=dict(C=0.1, l1_ratio=0.5), complexity=1),
    "svm": ModelSpec(
        "svm", "kernel", "kernel", _svm,
        lambda t: dict(C=t.suggest_float("C", 1e-2, 100, log=True),
                       gamma=t.suggest_float("gamma", 1e-4, 1.0, log=True)),
        defaults=dict(C=1.0, gamma="scale"), complexity=2),
    "rf": ModelSpec("rf", "tree", "bagging", _rf, _forest_space,
                    defaults=dict(n_estimators=300, min_samples_leaf=5, max_features="sqrt"),
                    complexity=3),
    "et": ModelSpec("et", "tree", "bagging", _et, _forest_space,
                    defaults=dict(n_estimators=300, min_samples_leaf=5, max_features="sqrt"),
                    complexity=3),
    "lgbm": ModelSpec(
        "lgbm", "tree", "boosting", lambda p: EarlyStoppedLGBM(**p),
        lambda t: dict(num_leaves=t.suggest_int("num_leaves", 4, 15),
                       min_child_samples=t.suggest_int("min_child_samples", 10, 30),
                       subsample=t.suggest_float("subsample", 0.6, 0.9),
                       colsample_bytree=t.suggest_float("colsample_bytree", 0.6, 0.9),
                       reg_alpha=t.suggest_float("reg_alpha", 1e-3, 10, log=True),
                       reg_lambda=t.suggest_float("reg_lambda", 1e-3, 10, log=True),
                       learning_rate=t.suggest_float("learning_rate", 0.01, 0.1, log=True)),
        complexity=4),
    "xgb": ModelSpec(
        "xgb", "tree", "boosting", lambda p: BalancedXGB(**p),
        lambda t: dict(max_depth=t.suggest_int("max_depth", 2, 4),
                       learning_rate=t.suggest_float("learning_rate", 0.01, 0.2, log=True),
                       n_estimators=t.suggest_int("n_estimators", 100, 600, step=50),
                       subsample=t.suggest_float("subsample", 0.6, 0.9),
                       colsample_bytree=t.suggest_float("colsample_bytree", 0.6, 0.9),
                       min_child_weight=t.suggest_int("min_child_weight", 1, 10),
                       reg_lambda=t.suggest_float("reg_lambda", 1.0, 20.0, log=True),
                       reg_alpha=t.suggest_float("reg_alpha", 1e-3, 5.0, log=True),
                       gamma=t.suggest_float("gamma", 0.0, 2.0)),
        complexity=4),
    "cat": ModelSpec(
        "cat", "tree", "boosting", _cat,
        lambda t: dict(depth=t.suggest_int("depth", 3, 6),
                       iterations=t.suggest_int("iterations", 200, 600, step=100),
                       learning_rate=t.suggest_float("learning_rate", 0.01, 0.15, log=True),
                       l2_leaf_reg=t.suggest_float("l2_leaf_reg", 1.0, 20.0, log=True),
                       random_strength=t.suggest_float("random_strength", 0.5, 5.0)),
        defaults=dict(depth=4, iterations=400, learning_rate=0.03, l2_leaf_reg=5.0),
        complexity=4),
    "tabpfn": ModelSpec("tabpfn", "pfn", "pfn", _tabpfn, lambda t: {},
                        defaults=dict(n_estimators=4), complexity=5),
}
ENSEMBLE_COMPLEXITY = {"vote": 6, "stack": 7}


@lru_cache(maxsize=1)
def tabpfn_status() -> tuple[bool, str]:
    """Probe TabPFN in a subprocess (no browser, 180 s timeout). Returns (available, reason)."""
    code = ("import numpy as np; from tabpfn import TabPFNClassifier;"
            "X=np.random.rand(40,5); y=(X[:,0]>.5).astype(int);"
            "TabPFNClassifier(device='cpu', n_estimators=1).fit(X,y).predict_proba(X); print('OK')")
    try:
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                           timeout=180, stdin=subprocess.DEVNULL,
                           env={**__import__("os").environ, "TABPFN_NO_BROWSER": "1"})
    except Exception as e:  # noqa: BLE001
        return False, f"probe failed: {type(e).__name__}: {e}"
    if "OK" in r.stdout:
        return True, "available"
    tail = (r.stderr or r.stdout).strip().splitlines()
    msg = next((l for l in reversed(tail) if "Error" in l or "error" in l), tail[-1] if tail else "")
    return False, msg[:300]


def available_models() -> list[str]:
    names = [n for n in REGISTRY if n != "tabpfn"]
    if tabpfn_status()[0]:
        names.append("tabpfn")
    return names


# ============================================================================ factories
def make_selector(selector: str | None):
    if not selector:
        return None
    if selector == "l1":
        return L1Selector()
    if selector.startswith("shap"):
        return ShapTopKSelector(k=int(selector[4:]))
    raise ValueError(f"unknown selector {selector!r}")


def member_pipeline(name: str, params: dict | None = None, smote: bool = False):
    """Model-specific tail: (linear prep) + (SMOTE) + estimator."""
    spec = REGISTRY[name]
    steps = []
    if spec.scaled:
        steps += [("drop", ColumnDropper()), ("log", Log1pTransformer()), ("scale", FrameScaler())]
    if smote:
        from imblearn.over_sampling import SMOTE
        steps.append(("smote", SMOTE(random_state=C.SEED, k_neighbors=5)))
    steps.append(("est", spec.build({**spec.defaults, **(params or {})})))
    if smote:
        from imblearn.pipeline import Pipeline as ImbPipeline
        return ImbPipeline(steps)
    return Pipeline(steps)


def _prefix(engineered: bool, selector: str | None):
    steps = [("encode", ClinicalEncoder()), ("engineer", ClinicalFeatureEngineer(engineered))]
    sel = make_selector(selector)
    if sel is not None:
        steps.append(("select", sel))
    return steps


def build_pipeline(name: str, params: dict | None = None, engineered: bool = True,
                   selector: str | None = None, smote: bool = False) -> Pipeline:
    return Pipeline(_prefix(engineered, selector) + [("model", member_pipeline(name, params, smote))])


def build_ensemble(members: list[tuple[str, dict]], kind: str = "vote", engineered: bool = True,
                   selector: str | None = None, smote: bool = False) -> Pipeline:
    ests = [(n, member_pipeline(n, p, smote)) for n, p in members]
    if kind == "vote":
        model = VotingClassifier(ests, voting="soft", n_jobs=1)
    else:
        model = StackingClassifier(
            ests, final_estimator=LogisticRegression(C=1.0, max_iter=1000),
            cv=StratifiedKFold(C.OOF_SPLITS, shuffle=True, random_state=C.SEED),
            stack_method="predict_proba", n_jobs=1)
    return Pipeline(_prefix(engineered, selector) + [("model", model)])


@dataclass
class ModelConfig:
    """Everything needed to rebuild one target's chosen model (single or ensemble)."""
    kind: str                                   # single | vote | stack
    members: list[tuple[str, dict]]             # [(model_name, params)]
    engineered: bool = True
    selector: str | None = None
    smote: bool = False

    def build(self) -> Pipeline:
        if self.kind == "single":
            n, p = self.members[0]
            return build_pipeline(n, p, self.engineered, self.selector, self.smote)
        return build_ensemble(self.members, self.kind, self.engineered, self.selector, self.smote)

    def with_params(self, params: list[dict]) -> "ModelConfig":
        return ModelConfig(self.kind, [(n, p) for (n, _), p in zip(self.members, params)],
                           self.engineered, self.selector, self.smote)

    @property
    def label(self) -> str:
        names = "+".join(n for n, _ in self.members)
        return names if self.kind == "single" else f"{self.kind}({names})"
