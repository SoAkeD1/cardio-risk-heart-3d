"""SHAP / LIME helpers and mapping of attributions back to RAW clinical features.

How a final prediction is explained
-----------------------------------
1. Each fitted base estimator gets its native SHAP explainer on the features it actually sees:
   TreeExplainer (RF / ET / LightGBM / XGBoost / CatBoost), LinearExplainer (logistic regression),
   PermutationExplainer (SVM / TabPFN, ``mode="exact"``) or - for real-time use - a TreeExplainer
   on a LightGBM surrogate of that model (``mode="fast"``; fidelity R² is recorded).
2. Member attributions are converted to probability units with a secant (local linear) factor,
   combined with the ensemble weights (soft vote: 1/m, stacking: meta-LR coefficients) and
   propagated through calibration / the hierarchical product P(CAD)·P(vessel|CAD) the same way.
   The result is rescaled so that, per patient, the contributions sum to
   ``P(patient) - mean P(background)``: every value is "percentage points of risk".
3. Engineered / one-hot features are summed onto their raw source features
   (``config.ENGINEERED_SOURCES``; multi-source features are split equally), then onto
   physiological groups.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import (ExtraTreesClassifier, RandomForestClassifier, StackingClassifier,
                              VotingClassifier)
from sklearn.linear_model import LogisticRegression

from . import config as C
from .data import encode_for_display
from .models import BalancedXGB, EarlyStoppedLGBM

RAW_FEATURES = list(C.FEATURES)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def unwrap_calibrated(model):
    """CalibratedClassifierCV(ensemble=False) -> the single fitted inner pipeline."""
    if isinstance(model, CalibratedClassifierCV):
        return model.calibrated_classifiers_[0].estimator
    return model


def raw_mapping(columns) -> pd.DataFrame:
    """Matrix (model columns x raw features): how each model column's SHAP is distributed."""
    M = pd.DataFrame(0.0, index=list(columns), columns=RAW_FEATURES)
    for c in columns:
        if c in C.ENGINEERED_SOURCES:
            src = C.ENGINEERED_SOURCES[c]
            M.loc[c, src] = 1.0 / len(src)
        elif c in M.columns:
            M.loc[c, c] = 1.0
    return M


# ============================================================================ members
class MemberExplainer:
    """Explains one member sub-pipeline ([drop, log, scale][, smote], est) on engineered input."""

    def __init__(self, member, Z_background: pd.DataFrame, Z_train: pd.DataFrame | None = None,
                 mode: str = "fast"):
        import shap
        self.member = member
        self.tail = member[:-1] if len(member.steps) > 1 else None
        self.est = member[-1]
        Wbg = self._tail(Z_background)
        self.columns = list(Wbg.columns)
        est = self.est
        self.method = None
        self.fidelity_r2 = None
        if isinstance(est, LogisticRegression):
            self.explainer, self.space, self.method = shap.LinearExplainer(est, Wbg), "logit", "linear"
        elif isinstance(est, (EarlyStoppedLGBM, BalancedXGB)):
            self.explainer, self.space, self.method = shap.TreeExplainer(est.model_), "logit", "tree"
        elif type(est).__name__ == "CatBoostClassifier":
            self.explainer, self.space, self.method = shap.TreeExplainer(est), "logit", "tree"
        elif isinstance(est, (RandomForestClassifier, ExtraTreesClassifier)):
            self.explainer, self.space, self.method = shap.TreeExplainer(est), "prob", "tree"
        elif mode == "exact":
            f = lambda W: est.predict_proba(pd.DataFrame(W, columns=self.columns))[:, 1]  # noqa: E731
            self.explainer = shap.PermutationExplainer(f, Wbg.to_numpy())
            self.space, self.method = "prob", "permutation"
        else:
            self._fit_surrogate(Wbg if Z_train is None else self._tail(Z_train))
        if self.method == "surrogate":
            return
        ev = self.explainer.expected_value if self.method != "permutation" else \
            float(np.mean(est.predict_proba(Wbg)[:, 1]))
        ev = np.atleast_1d(ev)
        self.expected = float(ev[-1])

    def _tail(self, Z):
        return self.tail.transform(Z) if self.tail is not None else Z

    def _fit_surrogate(self, W):
        """LightGBM regressor on the member's log-odds (real-time fallback for SVM / TabPFN)."""
        import lightgbm as lgb
        import shap
        rng = np.random.default_rng(C.SEED)
        synth = pd.DataFrame({c: rng.choice(W[c].to_numpy(), 2000) for c in W.columns})
        data = pd.concat([W, synth], ignore_index=True)
        target = _logit(self.est.predict_proba(data)[:, 1])
        n_fit = int(0.8 * len(data))
        idx = rng.permutation(len(data))
        sur = lgb.LGBMRegressor(n_estimators=400, num_leaves=15, learning_rate=0.05,
                                random_state=C.SEED, n_jobs=1, verbose=-1)
        sur.fit(data.iloc[idx[:n_fit]], target[idx[:n_fit]])
        pred = sur.predict(data.iloc[idx[n_fit:]])
        resid = target[idx[n_fit:]] - pred
        self.fidelity_r2 = float(1 - resid.var() / target[idx[n_fit:]].var())
        sur.fit(data, target)
        self.surrogate = sur
        self.explainer = shap.TreeExplainer(sur)
        self.space, self.method = "logit", "surrogate"
        self.expected = float(np.atleast_1d(self.explainer.expected_value)[-1])

    def explain(self, Z: pd.DataFrame) -> tuple[np.ndarray, pd.DataFrame]:
        """Returns (member probability, contributions in member-probability units, W columns)."""
        W = self._tail(Z)
        p = self.est.predict_proba(W)[:, 1]
        if self.method == "permutation":
            sv = self.explainer(W.to_numpy(), max_evals=2 * W.shape[1] + 1, silent=True).values
        else:
            sv = self.explainer.shap_values(W)
            if isinstance(sv, list):
                sv = sv[-1]
            sv = np.asarray(sv)
            if sv.ndim == 3:
                sv = sv[..., -1]
        f = sv.sum(axis=1) + self.expected                    # member output in its own space
        if self.space == "logit":
            p_ref, p_x = _sigmoid(self.expected), _sigmoid(f)
            deriv = p_x * (1 - p_x)
        else:
            p_ref, p_x, deriv = self.expected, f, np.ones_like(f)
        df = f - self.expected
        secant = np.where(np.abs(df) > 1e-6, (p_x - p_ref) / np.where(df == 0, 1, df), deriv)
        return p, pd.DataFrame(sv * secant[:, None], columns=W.columns, index=Z.index)


# ============================================================================ pipelines
class PipelineExplainer:
    """Explains a fitted (optionally calibrated) single/ensemble pipeline in raw-feature space."""

    def __init__(self, model, background_raw: pd.DataFrame, train_raw: pd.DataFrame | None = None,
                 mode: str = "fast"):
        self.model = model
        pipe = unwrap_calibrated(model)
        self.prefix = pipe[:-1]
        est = pipe.named_steps["model"]
        Zbg = self.prefix.transform(background_raw)
        Ztr = self.prefix.transform(train_raw) if train_raw is not None else None
        self.z_columns = list(Zbg.columns)
        if isinstance(est, VotingClassifier):
            members = est.estimators_
            self.weights = np.full(len(members), 1.0 / len(members))
            self.combine = "prob"
        elif isinstance(est, StackingClassifier):
            members = est.estimators_
            self.weights = est.final_estimator_.coef_.ravel()
            self.combine = "logit"
        else:
            members, self.weights, self.combine = [est], np.array([1.0]), "prob"
        self.members = [MemberExplainer(m, Zbg, Ztr, mode) for m in members]
        self.p_ref = float(model.predict_proba(background_raw)[:, 1].mean())
        self.mapping = raw_mapping(self.z_columns)

    @property
    def methods(self):
        return [m.method for m in self.members]

    def explain_raw(self, X: pd.DataFrame) -> tuple[np.ndarray, pd.DataFrame]:
        Z = self.prefix.transform(X)
        combined = pd.DataFrame(0.0, index=X.index, columns=self.z_columns)
        for w, m in zip(self.weights, self.members):
            _, c = m.explain(Z)
            combined = combined.add(w * c.reindex(columns=self.z_columns, fill_value=0.0))
        P = self.model.predict_proba(X)[:, 1]
        fallback = P * (1 - P) if self.combine == "logit" else np.ones_like(P)
        raw = combined.to_numpy() @ self.mapping.to_numpy()
        return P, _rescale(raw, P, self.p_ref, fallback, X.index)


class HierarchicalExplainer:
    """P(vessel) = P(CAD)·P(vessel|CAD): dP ≈ q·dP_cad + P_cad·dq, rescaled to P - P_ref."""

    def __init__(self, model, cad_explainer: PipelineExplainer, background_raw, train_raw=None,
                 mode="fast"):
        self.model = model
        self.cad = cad_explainer
        cond_train = train_raw
        self.cond = PipelineExplainer(model.cond_model, background_raw, cond_train, mode)
        self.p_ref = float(model.predict_proba(background_raw)[:, 1].mean())

    @property
    def methods(self):
        return self.cad.methods + self.cond.methods

    def explain_raw(self, X, cad_result=None):
        p, c_cad = cad_result if cad_result is not None else self.cad.explain_raw(X)
        q, c_cond = self.cond.explain_raw(X)
        P = p * q
        raw = (c_cad.to_numpy() * q[:, None]) + (c_cond.to_numpy() * p[:, None])
        return P, _rescale(raw, P, self.p_ref, np.ones_like(P), X.index)


def _rescale(raw: np.ndarray, P, p_ref, fallback, index) -> pd.DataFrame:
    S = raw.sum(axis=1)
    target = P - p_ref
    ok = (np.abs(S) > 1e-9) & (S * target > 0)
    k = np.where(ok, target / np.where(ok, S, 1.0), fallback)
    return pd.DataFrame(raw * k[:, None], columns=RAW_FEATURES, index=index)


def build_explainers(models: dict, background_raw, train_raw=None, mode="fast") -> dict:
    from .vessels import HierarchicalVesselModel
    out = {"cad": PipelineExplainer(models["cad"], background_raw, train_raw, mode)}
    for t in C.VESSELS:
        m = models[t]
        if isinstance(m, HierarchicalVesselModel):
            out[t] = HierarchicalExplainer(m, out["cad"], background_raw, train_raw, mode)
        else:
            out[t] = PipelineExplainer(m, background_raw, train_raw, mode)
    return out


# ============================================================================ summaries
def group_totals(contrib: pd.DataFrame | pd.Series, signed=False) -> pd.DataFrame | pd.Series:
    """Per physiological group: share of total |attribution| in % (or signed sums)."""
    groups = pd.Series({f: C.FEATURES[f]["group"] for f in RAW_FEATURES})
    if isinstance(contrib, pd.Series):
        contrib = contrib.to_frame().T
    vals = contrib if signed else contrib.abs()
    g = vals.T.groupby(groups).sum().T.reindex(columns=C.GROUPS, fill_value=0.0)
    if signed:
        return g
    return g.div(g.sum(axis=1).replace(0, 1), axis=0) * 100


def top_features(contrib_row: pd.Series, raw_row: pd.Series, k=8) -> list[dict]:
    total = contrib_row.abs().sum() or 1.0
    out = []
    for f in contrib_row.abs().sort_values(ascending=False).index[:k]:
        v = raw_row.get(f)
        out.append(dict(
            feature=f, label=C.FEATURES[f]["label"], group=C.FEATURES[f]["group"],
            value=v.item() if hasattr(v, "item") else v, unit=C.FEATURES[f]["unit"],
            shap=round(float(contrib_row[f]), 5),
            contribution_pct=round(float(abs(contrib_row[f]) / total * 100), 2),
            direction="raises risk" if contrib_row[f] > 0 else "lowers risk"))
    return out


def shap_explanation(contrib: pd.DataFrame, X_raw: pd.DataFrame, base: float):
    """shap.Explanation in raw-feature space (for beeswarm / waterfall plots)."""
    import shap
    disp = encode_for_display(X_raw).reindex(columns=RAW_FEATURES)
    return shap.Explanation(values=contrib.to_numpy(), base_values=np.full(len(contrib), base),
                            data=disp.to_numpy(),
                            feature_names=[C.FEATURES[f]["label"] for f in RAW_FEATURES])


# ============================================================================ LIME
def lime_top_features(model, X_train_raw, X_explain_raw, k=5, num_samples=3000) -> list[list[str]]:
    """LIME (lime_tabular) on the raw-feature display encoding. Returns top-k raw names per row."""
    from lime.lime_tabular import LimeTabularExplainer
    Dtr = encode_for_display(X_train_raw)
    cols = list(Dtr.columns)
    cat_idx = [i for i, c in enumerate(cols) if C.FEATURES[c]["type"] != "numeric"]
    lime = LimeTabularExplainer(Dtr.to_numpy(), feature_names=cols, categorical_features=cat_idx,
                                class_names=["neg", "pos"], discretize_continuous=True,
                                random_state=C.SEED, mode="classification")

    def predict(arr):
        df = pd.DataFrame(arr, columns=cols)
        for c in cols:
            if C.FEATURES[c]["type"] != "numeric":
                df[c] = df[c].round().astype(int)
        return model.predict_proba(df)

    out = []
    for _, row in encode_for_display(X_explain_raw).iterrows():
        exp = lime.explain_instance(row.to_numpy(), predict, num_features=k,
                                    num_samples=num_samples)
        out.append([cols[i] for i, _ in exp.as_map()[1]])
    return out
