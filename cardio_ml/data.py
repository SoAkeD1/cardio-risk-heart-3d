"""Loading, column-name normalisation, deterministic encoding and target extraction."""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C

# Spelling differences between the UCI and Kaggle exports -> canonical clean name.
ALIASES = {
    "functionclass": "function_class",
    "region_with_rwma": "region_rwma",
    "regionrwma": "region_rwma",
    "ef": "ef_tte",
    "eftte": "ef_tte",
    "low_th_ang": "lowth_ang",
    "lowthang": "lowth_ang",
    "exertional_chest_pain": "exertional_cp",
    "t_inversion": "tinversion",
    "exsmoker": "ex_smoker",
    "currentsmoker": "current_smoker",
    "height": "length",
}

_YES = {"y", "yes", "1", "true", "t"}
_NO = {"n", "no", "0", "false", "f"}
_SEX = {"male": 1, "m": 1, "1": 1, "fmale": 0, "female": 0, "f": 0, "0": 0}   # "Fmale" is a source typo
_VHD = {"n": 0, "none": 0, "0": 0, "mild": 1, "1": 1, "moderate": 2, "2": 2, "severe": 3, "3": 3}
_BBB = {"n": "N", "0": "N", "lbbb": "LBBB", "1": "LBBB", "rbbb": "RBBB", "2": "RBBB"}


def clean_name(name: str) -> str:
    """'EX-Smoker ' -> 'ex_smoker'; applies known UCI/Kaggle aliases."""
    key = re.sub(r"[^0-9a-z]+", "_", str(name).strip().lower()).strip("_")
    return ALIASES.get(key, key)


def load_raw(path: str | Path | None = None) -> tuple[pd.DataFrame, dict[str, str]]:
    """Read .xlsx/.csv, normalise column names. Returns (df, {clean_name: original_name})."""
    path = Path(path or C.DATA_PATH)
    if path.suffix.lower() in {".xlsx", ".xls"}:
        df = pd.read_excel(path)
    else:
        df = pd.read_csv(path)
    mapping = {clean_name(c): str(c).strip() for c in df.columns}
    df = df.rename(columns={c: clean_name(c) for c in df.columns})
    for c in df.columns:                      # strip stray whitespace in string cells
        if df[c].dtype == object or pd.api.types.is_string_dtype(df[c]):
            df[c] = df[c].astype(str).str.strip()
    missing = (set(C.FEATURES) | set(C.LABEL_COLUMNS)) - set(df.columns)
    if missing:
        raise KeyError(f"Dataset is missing expected columns: {sorted(missing)}")
    return df, mapping


def get_targets(df: pd.DataFrame) -> pd.DataFrame:
    """0/1 frame with columns cad, lad, lcx, rca."""
    out = {}
    for key, (col, pos) in C.TARGETS.items():
        out[key] = (df[col].astype(str).str.strip().str.lower() == pos).astype(int)
    return pd.DataFrame(out, index=df.index)


def get_features(df: pd.DataFrame) -> pd.DataFrame:
    """Raw input features only (label columns removed) in schema order."""
    return df[list(C.FEATURES)].copy()


def assert_no_leakage(X: pd.DataFrame) -> None:
    """Hard rule (PS 1d): true labels are never model inputs."""
    bad = {clean_name(c) for c in X.columns} & set(C.LABEL_COLUMNS)
    if bad:
        raise AssertionError(f"Target leakage: label columns {sorted(bad)} present in features")


# ----------------------------------------------------------------------------- encoding
def _lookup(series: pd.Series, table: dict, name: str) -> pd.Series:
    def conv(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return np.nan
        if isinstance(v, (bool, np.bool_)):
            v = int(v)
        if isinstance(v, (int, float, np.integer, np.floating)) and float(v).is_integer():
            v = int(v)
        key = str(v).strip().lower()
        if key not in table:
            raise ValueError(f"Invalid value {v!r} for '{name}'. Allowed: {sorted(set(table))}")
        return table[key]
    return series.map(conv)


def encode_binary(series: pd.Series, name: str) -> pd.Series:
    table = {**{k: 1 for k in _YES}, **{k: 0 for k in _NO}}
    return _lookup(series, table, name).astype(float)


def encode_frame(X: pd.DataFrame) -> pd.DataFrame:
    """Deterministic encoding of raw clinical columns -> all-numeric frame.

    Y/N -> 1/0, Sex Male/Fmale -> 1/0, VHD ordinal 0-3, Function Class and Region RWMA ordinal,
    BBB one-hot (reference N). Accepts already-numeric inputs too (dashboard / LIME).
    Columns named ``pred_*`` (out-of-fold upstream predictions in classifier chains) pass through.
    """
    out = pd.DataFrame(index=X.index)
    for name, meta in C.FEATURES.items():
        if name not in X.columns:
            continue
        s = X[name]
        if name == "sex":
            out[name] = _lookup(s, _SEX, name).astype(float)
        elif name == "vhd":
            out[name] = _lookup(s, _VHD, name).astype(float)
        elif name == "bbb":
            b = _lookup(s, _BBB, name)
            out["bbb_lbbb"] = (b == "LBBB").astype(float)
            out["bbb_rbbb"] = (b == "RBBB").astype(float)
        elif meta["type"] == "binary":
            out[name] = encode_binary(s, name)
        else:
            out[name] = pd.to_numeric(s, errors="raise").astype(float)
    for c in X.columns:
        if str(c).startswith("pred_"):
            out[c] = X[c].astype(float)
    return out


def encode_for_display(X: pd.DataFrame) -> pd.DataFrame:
    """One numeric column per RAW feature (BBB as 0/1/2) - used for LIME and beeswarm colours."""
    enc = encode_frame(X)
    disp = enc.drop(columns=["bbb_lbbb", "bbb_rbbb"], errors="ignore")
    if "bbb_lbbb" in enc:
        disp["bbb"] = enc["bbb_lbbb"] * 1 + enc["bbb_rbbb"] * 2
    return disp[[c for c in C.FEATURES if c in disp.columns]]


def n_stenotic(y: pd.DataFrame) -> pd.Series:
    return y[C.VESSELS].sum(axis=1)


# ----------------------------------------------------------------------------- schema
def build_feature_schema(X_train_raw: pd.DataFrame, mapping: dict[str, str]) -> dict:
    """Schema of every RAW input feature (drives dashboard inputs + physiological breakdown).
    Ranges / defaults come from the TRAINING split only."""
    disp = encode_for_display(X_train_raw)
    feats = []
    for name, meta in C.FEATURES.items():
        col = disp[name]
        entry = dict(name=name, original_name=mapping.get(name, name), label=meta["label"],
                     group=meta["group"], type=meta["type"], unit=meta["unit"],
                     used_by_model=name not in C.DROP_CONSTANT)
        if meta["type"] == "numeric":
            entry.update(min=float(col.min()), max=float(col.max()),
                         default=float(round(col.median(), 2)))
            if name in C.HARD_LIMITS:
                entry["hard_limits"] = list(C.HARD_LIMITS[name])
        elif meta["type"] == "binary":
            mode = int(col.mode().iloc[0])
            if name == "sex":
                entry.update(allowed_values=["Male", "Female"], encoding={"Male": 1, "Female": 0},
                             default="Male" if mode == 1 else "Female")
            else:
                entry.update(allowed_values=[0, 1], encoding={"Y": 1, "N": 0}, default=mode)
        else:
            inv = {v: k for k, v in meta["values"].items()}
            mode = int(col.mode().iloc[0])
            entry.update(allowed_values=list(meta["values"]), encoding=meta["values"],
                         default=inv[mode] if meta["type"] == "categorical" or name == "vhd" else mode)
        feats.append(entry)
    return dict(dataset=C.DATASET_CITATION, groups=C.GROUPS, features=feats,
                note="Region RWMA is an echo feature only - NOT an anatomical coordinate; "
                     "never map it onto the 3D coronary model.")
