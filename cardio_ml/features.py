"""Custom sklearn transformers. All are fitted inside each training fold of the Pipeline.

They live in the package (not the notebook) so that saved joblib pipelines reload anywhere.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from . import config as C
from .data import assert_no_leakage, encode_frame


class _FrameTransformer(TransformerMixin, BaseEstimator):
    """Base: DataFrame in, DataFrame out, remembers output column names."""

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names_out_, dtype=object)

    def set_output(self, *, transform=None):   # always pandas; keep sklearn API happy
        return self


class ClinicalEncoder(_FrameTransformer):
    """Deterministic encoding (see data.encode_frame) + drop audit-verified constant columns.

    ``fit`` asserts that no label column (Cath/LAD/LCX/RCA) is present - the leakage guard
    runs before every fit of every pipeline.
    """

    def __init__(self, drop=tuple(C.DROP_CONSTANT)):
        self.drop = drop

    def fit(self, X, y=None):
        assert_no_leakage(X)
        self.feature_names_out_ = list(self.transform(X).columns)
        return self

    def transform(self, X):
        assert_no_leakage(X)
        Z = encode_frame(X)
        return Z.drop(columns=[c for c in self.drop if c in Z.columns])


# Diamond & Forrester (N Engl J Med 1979;300:1350-8) pretest probability of CAD (%), as tabulated
# in the ACC/AHA 2002 chronic stable angina guideline (Gibbons et al., Table 4).
# Ages < 30 use the 30-39 band and ages >= 70 use the 60-69 band (extrapolation; stated).
_DF_TABLE = {  # band: {chest-pain type: (male, female)}
    30: {"typical": (69.7, 25.8), "atypical": (21.8, 4.2), "nonanginal": (5.2, 0.8), "none": (1.9, 0.3)},
    40: {"typical": (87.3, 55.2), "atypical": (46.1, 13.3), "nonanginal": (14.1, 2.8), "none": (5.5, 1.0)},
    50: {"typical": (92.0, 79.4), "atypical": (58.9, 32.4), "nonanginal": (21.5, 8.4), "none": (9.7, 3.2)},
    60: {"typical": (94.3, 90.6), "atypical": (67.1, 54.4), "nonanginal": (28.1, 18.6), "none": (12.3, 7.5)},
}
_CP_NAMES = {3: "typical", 2: "atypical", 1: "nonanginal", 0: "none"}


def chest_pain_type(Z: pd.DataFrame) -> pd.Series:
    """Ordinal 0 none / 1 non-anginal / 2 atypical / 3 typical (typical > atypical > non-anginal
    precedence; the source columns overlap in only 2 of 303 patients)."""
    cp = np.zeros(len(Z))
    cp = np.where(Z["nonanginal"] == 1, 1, cp)
    cp = np.where(Z["atypical"] == 1, 2, cp)
    cp = np.where(Z["typical_chest_pain"] == 1, 3, cp)
    return pd.Series(cp, index=Z.index, dtype=float)


def diamond_forrester(age: pd.Series, sex: pd.Series, cp_type: pd.Series) -> pd.Series:
    band = (np.clip(age.to_numpy(), 30, 69) // 10 * 10).astype(int)
    vals = [_DF_TABLE[b][_CP_NAMES[int(c)]][0 if s == 1 else 1] / 100.0
            for b, s, c in zip(band, sex.to_numpy(), cp_type.to_numpy())]
    return pd.Series(vals, index=age.index, dtype=float)


def ckd_epi_2021(cr: pd.Series, age: pd.Series, sex: pd.Series) -> pd.Series:
    """Race-free CKD-EPI 2021 eGFR (mL/min/1.73m²). Creatinine assumed in mg/dL."""
    female = sex.to_numpy() == 0
    kappa = np.where(female, 0.7, 0.9)
    alpha = np.where(female, -0.241, -0.302)
    r = cr.to_numpy() / kappa
    egfr = 142 * np.minimum(r, 1) ** alpha * np.maximum(r, 1) ** -1.200 * 0.9938 ** age.to_numpy()
    egfr = egfr * np.where(female, 1.012, 1.0)
    return pd.Series(egfr, index=cr.index, dtype=float)


def _safe_div(a: pd.Series, b: pd.Series) -> pd.Series:
    b = b.where(b.abs() > 1e-9, np.nan)
    return (a / b).fillna(0.0)


class ClinicalFeatureEngineer(_FrameTransformer):
    """Adds domain composites, Diamond-Forrester pretest probability, lab ratios and eGFR.

    Stateless (no fitted parameters), so it cannot leak - but it still sits inside the fold
    Pipeline so that train/test/deployment go through exactly the same code.
    """

    def __init__(self, enabled: bool = True):
        self.enabled = enabled

    def fit(self, X, y=None):
        self.feature_names_out_ = list(self.transform(X).columns)
        return self

    def transform(self, X):
        Z = X.copy()
        if not self.enabled:
            return Z
        Z["risk_factor_count"] = Z[C.RISK_FACTORS].sum(axis=1)
        bbb_any = Z.get("bbb_lbbb", 0) + Z.get("bbb_rbbb", 0)
        Z["ecg_abnormal_count"] = Z[C.ECG_FLAGS].sum(axis=1) + (bbb_any > 0)
        Z["ischemic_ecg"] = (Z[C.ISCHEMIC_ECG].max(axis=1) > 0).astype(float)
        Z["rwma_present"] = (Z["region_rwma"] > 0).astype(float)
        Z["ef_category"] = np.select([Z["ef_tte"] < 40, Z["ef_tte"] < 50], [0.0, 1.0], 2.0)
        Z["chest_pain_type"] = chest_pain_type(Z)
        Z["pretest_prob"] = diamond_forrester(Z["age"], Z["sex"], Z["chest_pain_type"])
        Z["tg_hdl"] = _safe_div(Z["tg"], Z["hdl"])
        Z["ldl_hdl"] = _safe_div(Z["ldl"], Z["hdl"])
        Z["nlr"] = _safe_div(Z["neut"], Z["lymph"])
        Z["abs_lymph"] = Z["wbc"] * Z["lymph"] / 100.0
        Z["plr"] = _safe_div(Z["plt"] * 1000.0, Z["abs_lymph"])   # PLT is x10^3/µL
        Z["egfr"] = ckd_epi_2021(Z["cr"], Z["age"], Z["sex"])
        return Z.astype(float)


class ColumnDropper(_FrameTransformer):
    """Drops collinear columns for linear/kernel models (BMI kept; weight/height/obesity dropped)."""

    def __init__(self, columns=tuple(C.LINEAR_DROP)):
        self.columns = columns

    def fit(self, X, y=None):
        self.feature_names_out_ = [c for c in X.columns if c not in self.columns]
        return self

    def transform(self, X):
        return X[[c for c in self.feature_names_out_ if c in X.columns]]


class Log1pTransformer(_FrameTransformer):
    """log1p on right-skewed labs and ratios (linear / SVM / kNN only)."""

    def __init__(self, columns=tuple(C.SKEWED_LABS) + ("tg_hdl", "nlr", "plr")):
        self.columns = columns

    def fit(self, X, y=None):
        self.feature_names_out_ = list(X.columns)
        return self

    def transform(self, X):
        Z = X.copy()
        for c in self.columns:
            if c in Z.columns:
                Z[c] = np.log1p(Z[c].clip(lower=0))
        return Z


class FrameScaler(_FrameTransformer):
    """StandardScaler that keeps DataFrame column names (needed for SHAP name mapping)."""

    def fit(self, X, y=None):
        self.mean_ = X.mean()
        self.scale_ = X.std(ddof=0).replace(0, 1.0)
        self.feature_names_out_ = list(X.columns)
        return self

    def transform(self, X):
        return (X[self.feature_names_out_] - self.mean_) / self.scale_


class L1Selector(_FrameTransformer):
    """Keeps features with non-zero L1-logistic coefficients (fitted on the fold's train part)."""

    def __init__(self, C_=0.1, min_features=5, random_state=C.SEED):
        self.C_ = C_
        self.min_features = min_features
        self.random_state = random_state

    def fit(self, X, y):
        from sklearn.linear_model import LogisticRegression
        Zs = (X - X.mean()) / X.std(ddof=0).replace(0, 1.0)
        lr = LogisticRegression(l1_ratio=1.0, solver="liblinear", C=self.C_,
                                class_weight="balanced", random_state=self.random_state)
        lr.fit(Zs, y)
        coef = np.abs(lr.coef_.ravel())
        order = np.argsort(-coef)
        keep = [X.columns[i] for i in order if coef[i] > 0]
        if len(keep) < self.min_features:
            keep = [X.columns[i] for i in order[: self.min_features]]
        self.feature_names_out_ = [c for c in X.columns if c in set(keep)]
        return self

    def transform(self, X):
        return X[self.feature_names_out_]


class ShapTopKSelector(_FrameTransformer):
    """Keeps the top-k features by mean |SHAP| of a small LightGBM fitted on the fold's train part."""

    def __init__(self, k=15, random_state=C.SEED):
        self.k = k
        self.random_state = random_state

    def fit(self, X, y):
        import lightgbm as lgb
        import shap
        m = lgb.LGBMClassifier(n_estimators=200, num_leaves=7, learning_rate=0.05,
                               min_child_samples=15, subsample=0.8, subsample_freq=1,
                               colsample_bytree=0.8, reg_lambda=1.0, class_weight="balanced",
                               random_state=self.random_state, n_jobs=1, verbose=-1)
        m.fit(X, y)
        sv = shap.TreeExplainer(m).shap_values(X)
        sv = sv[1] if isinstance(sv, list) else sv
        imp = np.abs(np.asarray(sv)).mean(axis=0)
        if imp.ndim > 1:
            imp = imp[..., -1]
        top = set(X.columns[np.argsort(-imp)[: self.k]])
        self.feature_names_out_ = [c for c in X.columns if c in top]
        return self

    def transform(self, X):
        return X[self.feature_names_out_]
