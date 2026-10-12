"""Multi-vessel strategies.

A. Independent   : one model per vessel (plain pipelines, nothing here).
B. Classifier chain ensemble : 5 chain orders; downstream models see only OUT-OF-FOLD PREDICTED
   upstream probabilities (``pred_<target>`` columns), never true labels.
C. Hierarchical  : P(vessel) = P(CAD) x P(vessel stenotic | CAD); the conditional model is trained
   on CAD-positive training patients only, so the 3D view never shows a high vessel risk when
   CAD itself is unlikely.
"""
from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from . import config as C
from .data import assert_no_leakage
from .evaluation import CVResult


class HierarchicalVesselModel(ClassifierMixin, BaseEstimator):
    """Combines a fitted CAD model and a fitted conditional vessel model."""

    def __init__(self, cad_model=None, cond_model=None):
        self.cad_model = cad_model
        self.cond_model = cond_model
        self.classes_ = np.array([0, 1])

    def fit(self, X, y_vessel, y_cad, make_cad: Callable, make_cond: Callable):
        assert_no_leakage(X)
        y_vessel, y_cad = np.asarray(y_vessel), np.asarray(y_cad)
        self.cad_model = make_cad().fit(X, y_cad)
        pos = y_cad == 1
        self.cond_model = make_cond().fit(X[pos], y_vessel[pos])
        return self

    def predict_proba(self, X):
        p = self.cad_model.predict_proba(X)[:, 1] * self.cond_model.predict_proba(X)[:, 1]
        return np.column_stack([1 - p, p])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


class ChainEnsemble:
    """Ensemble of classifier chains over C.TARGETS keys. ``makers[t]()`` -> fresh estimator."""

    def __init__(self, makers: dict, n_orders=5, oof_splits=C.OOF_SPLITS, seed=C.SEED):
        self.makers = makers
        self.n_orders = n_orders
        self.oof_splits = oof_splits
        self.seed = seed

    def orders(self):
        keys = list(C.TARGETS)
        rng = np.random.default_rng(self.seed)
        out = [keys]                                   # CAD -> LAD -> LCX -> RCA
        while len(out) < self.n_orders:
            o = list(rng.permutation(keys))
            if o not in out:
                out.append(o)
        return out

    def fit(self, X: pd.DataFrame, Y: pd.DataFrame):
        assert_no_leakage(X)
        cv = StratifiedKFold(self.oof_splits, shuffle=True, random_state=self.seed)
        self.chains_ = []
        for order in self.orders():
            Xa, models = X.copy(), {}
            for t in order:
                y = Y[t].to_numpy()
                models[t] = self.makers[t]().fit(Xa, y)
                Xa[f"pred_{t}"] = cross_val_predict(self.makers[t](), Xa, y, cv=cv,
                                                    method="predict_proba")[:, 1]
            self.chains_.append((order, models))
        return self

    def predict_all(self, X: pd.DataFrame) -> pd.DataFrame:
        acc = {t: [] for t in C.TARGETS}
        for order, models in self.chains_:
            Xa = X.copy()
            for t in order:
                p = models[t].predict_proba(Xa)[:, 1]
                Xa[f"pred_{t}"] = p
                acc[t].append(p)
        return pd.DataFrame({t: np.mean(v, axis=0) for t, v in acc.items()}, index=X.index)


# ============================================================================ CV comparisons
def _hier_fold(make_cad, make_cond, X, ycad, yv, tr, te):
    m = HierarchicalVesselModel().fit(X.iloc[tr], yv[tr], ycad[tr], make_cad, make_cond)
    return m.predict_proba(X.iloc[te])[:, 1]


def cv_hierarchical(make_cad, make_cond, X, y_cad, y_vessel, splits, name="C",
                    n_jobs=C.N_JOBS) -> CVResult:
    ycad, yv = np.asarray(y_cad), np.asarray(y_vessel)
    probs = Parallel(n_jobs=n_jobs)(delayed(_hier_fold)(make_cad, make_cond, X, ycad, yv, tr, te)
                                    for tr, te in splits)
    return CVResult(name, len(X), splits, test_probs=list(probs), inner_oof=[None] * len(splits),
                    thresholds=[0.5] * len(splits), params=[{}] * len(splits))


def _chain_fold(makers, X, Y, tr, te):
    ce = ChainEnsemble(makers).fit(X.iloc[tr], Y.iloc[tr])
    return ce.predict_all(X.iloc[te])


def cv_chain(makers, X, Y, splits, n_jobs=C.N_JOBS) -> dict[str, CVResult]:
    outs = Parallel(n_jobs=n_jobs)(delayed(_chain_fold)(makers, X, Y, tr, te) for tr, te in splits)
    return {t: CVResult(f"B:{t}", len(X), splits, test_probs=[o[t].to_numpy() for o in outs],
                        inner_oof=[None] * len(splits), thresholds=[0.5] * len(splits),
                        params=[{}] * len(splits))
            for t in C.TARGETS}
