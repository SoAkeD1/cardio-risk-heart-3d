"""Central configuration: paths, seeds, run mode, targets, feature metadata, risk bands.

To add a feature, target or model you only edit this file (features / targets) or the
registry in ``models.py`` (models). Nothing else needs to change.
"""
from __future__ import annotations

import os
from pathlib import Path

# TabPFN v2 weights are licence-gated on HuggingFace. Never open a browser from a pipeline run:
# if TABPFN_TOKEN is not configured, TabPFN is skipped (see models.tabpfn_status()).
os.environ.setdefault("TABPFN_NO_BROWSER", "1")
os.environ.setdefault("TABPFN_DISABLE_TELEMETRY", "1")

# ----------------------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = Path(os.environ.get("CARDIO_DATA_PATH",
                                ROOT / "data" / "extention of Z-Alizadeh sani dataset.xlsx"))
ARTIFACTS_DIR = Path(os.environ.get("CARDIO_ARTIFACTS", ROOT / "artifacts"))
MODELS_DIR = ARTIFACTS_DIR / "models"
FIG_DIR = ARTIFACTS_DIR / "figures"
CACHE_DIR = ARTIFACTS_DIR / "cache"

DATASET_CITATION = (
    "Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2017). Extension of Z-Alizadeh Sani "
    "[Dataset]. UCI Machine Learning Repository, id 411. https://doi.org/10.24432/C5Q31M"
)

# ----------------------------------------------------------------------------- run mode
SEED = 42
# FAST_MODE=True -> quick iteration; False -> full run used for the reported results.
FAST_MODE = os.environ.get("CARDIO_FAST_MODE", "0") == "1"

TEST_SIZE = 0.20
CV_SPLITS = 5
CV_REPEATS = 2 if FAST_MODE else 5
INNER_SPLITS = 3                     # nested tuning folds
OOF_SPLITS = 5                       # inner OOF used for thresholds / stacking / calibration
N_TRIALS = 8 if FAST_MODE else 30    # Optuna trials per model per outer fold (<= 50)
FINAL_TRIALS = 15 if FAST_MODE else 50
N_BOOTSTRAP = 1000
N_JOBS = max(1, (os.cpu_count() or 2) - 1)
SHAP_BACKGROUND_SIZE = 50
LATENCY_BUDGET_MS = 300

# Model selection tolerances (primary AUC, secondary F1, tie-break Brier, then simplicity).
SELECTION_TOL = {"auc": 0.005, "f1": 0.01, "brier": 0.005}
FEATURE_SELECTION_TOL = 0.01         # keep smallest feature set within 0.01 AUC of best
VESSEL_STRATEGY_TOL = 0.01           # within-tolerance ties: C (hierarchical) > A (independent) > B (chain)

# ----------------------------------------------------------------------------- targets
# key -> (source column (clean name), positive class label). Keys lad/lcx/rca are FIXED:
# they match the 3D mesh names used downstream.
TARGETS = {
    "cad": ("cath", "cad"),
    "lad": ("lad", "stenotic"),
    "lcx": ("lcx", "stenotic"),
    "rca": ("rca", "stenotic"),
}
VESSELS = ["lad", "lcx", "rca"]
LABEL_COLUMNS = [src for src, _ in TARGETS.values()]   # never allowed as model inputs
TARGET_DISPLAY = {"cad": "CAD (Cath)", "lad": "LAD", "lcx": "LCX", "rca": "RCA"}
POSITIVE_TEXT = {"cad": "CAD", "lad": "Stenotic", "lcx": "Stenotic", "rca": "Stenotic"}
NEGATIVE_TEXT = {"cad": "Normal", "lad": "Normal", "lcx": "Normal", "rca": "Normal"}

# ----------------------------------------------------------------------------- features
GROUPS = ["demographic", "risk factor", "examination", "ECG", "lab", "echo"]

# clean_name -> metadata. type: binary | numeric | ordinal | categorical.
# Units follow the UCI documentation (Iranian hospital labs, conventional US units).
FEATURES: dict[str, dict] = {
    "age": dict(group="demographic", type="numeric", unit="years", label="Age"),
    "weight": dict(group="demographic", type="numeric", unit="kg", label="Weight"),
    "length": dict(group="demographic", type="numeric", unit="cm", label="Height"),
    "sex": dict(group="demographic", type="binary", unit="", label="Sex (male)",
                values={"Male": 1, "Female": 0}),
    "bmi": dict(group="demographic", type="numeric", unit="kg/m²", label="BMI"),
    "dm": dict(group="risk factor", type="binary", unit="", label="Diabetes mellitus"),
    "htn": dict(group="risk factor", type="binary", unit="", label="Hypertension"),
    "current_smoker": dict(group="risk factor", type="binary", unit="", label="Current smoker"),
    "ex_smoker": dict(group="risk factor", type="binary", unit="", label="Ex-smoker"),
    "fh": dict(group="risk factor", type="binary", unit="", label="Family history of CAD"),
    "obesity": dict(group="risk factor", type="binary", unit="", label="Obesity"),
    "crf": dict(group="risk factor", type="binary", unit="", label="Chronic renal failure"),
    "cva": dict(group="risk factor", type="binary", unit="", label="Prior stroke (CVA)"),
    "airway_disease": dict(group="risk factor", type="binary", unit="", label="Airway disease"),
    "thyroid_disease": dict(group="risk factor", type="binary", unit="", label="Thyroid disease"),
    "chf": dict(group="risk factor", type="binary", unit="", label="Congestive heart failure"),
    "dlp": dict(group="risk factor", type="binary", unit="", label="Dyslipidaemia"),
    "bp": dict(group="examination", type="numeric", unit="mmHg", label="Systolic blood pressure"),
    "pr": dict(group="examination", type="numeric", unit="bpm", label="Pulse rate"),
    "edema": dict(group="examination", type="binary", unit="", label="Edema"),
    "weak_peripheral_pulse": dict(group="examination", type="binary", unit="", label="Weak peripheral pulse"),
    "lung_rales": dict(group="examination", type="binary", unit="", label="Lung rales"),
    "systolic_murmur": dict(group="examination", type="binary", unit="", label="Systolic murmur"),
    "diastolic_murmur": dict(group="examination", type="binary", unit="", label="Diastolic murmur"),
    "typical_chest_pain": dict(group="examination", type="binary", unit="", label="Typical chest pain"),
    "dyspnea": dict(group="examination", type="binary", unit="", label="Dyspnea"),
    "function_class": dict(group="examination", type="ordinal", unit="", label="Functional class",
                           values={str(i): i for i in range(4)}),
    "atypical": dict(group="examination", type="binary", unit="", label="Atypical chest pain"),
    "nonanginal": dict(group="examination", type="binary", unit="", label="Non-anginal chest pain"),
    "exertional_cp": dict(group="examination", type="binary", unit="", label="Exertional chest pain"),
    "lowth_ang": dict(group="examination", type="binary", unit="", label="Low-threshold angina"),
    "q_wave": dict(group="ECG", type="binary", unit="", label="Q wave"),
    "st_elevation": dict(group="ECG", type="binary", unit="", label="ST elevation"),
    "st_depression": dict(group="ECG", type="binary", unit="", label="ST depression"),
    "tinversion": dict(group="ECG", type="binary", unit="", label="T-wave inversion"),
    "lvh": dict(group="ECG", type="binary", unit="", label="Left ventricular hypertrophy"),
    "poor_r_progression": dict(group="ECG", type="binary", unit="", label="Poor R-wave progression"),
    "bbb": dict(group="ECG", type="categorical", unit="", label="Bundle branch block",
                values={"N": 0, "LBBB": 1, "RBBB": 2}),
    "fbs": dict(group="lab", type="numeric", unit="mg/dL", label="Fasting blood sugar"),
    "cr": dict(group="lab", type="numeric", unit="mg/dL", label="Creatinine"),
    "tg": dict(group="lab", type="numeric", unit="mg/dL", label="Triglycerides"),
    "ldl": dict(group="lab", type="numeric", unit="mg/dL", label="LDL cholesterol"),
    "hdl": dict(group="lab", type="numeric", unit="mg/dL", label="HDL cholesterol"),
    "bun": dict(group="lab", type="numeric", unit="mg/dL", label="Blood urea nitrogen"),
    "esr": dict(group="lab", type="numeric", unit="mm/h", label="ESR"),
    "hb": dict(group="lab", type="numeric", unit="g/dL", label="Haemoglobin"),
    "k": dict(group="lab", type="numeric", unit="mEq/L", label="Potassium"),
    "na": dict(group="lab", type="numeric", unit="mEq/L", label="Sodium"),
    "wbc": dict(group="lab", type="numeric", unit="cells/µL", label="White blood cells"),
    "lymph": dict(group="lab", type="numeric", unit="%", label="Lymphocytes"),
    "neut": dict(group="lab", type="numeric", unit="%", label="Neutrophils"),
    "plt": dict(group="lab", type="numeric", unit="×10³/µL", label="Platelets"),
    "ef_tte": dict(group="echo", type="numeric", unit="%", label="EF-TTE (ejection fraction)"),
    "region_rwma": dict(group="echo", type="ordinal", unit="regions", label="Regional wall-motion abnormality",
                        values={str(i): i for i in range(5)}),
    "vhd": dict(group="echo", type="ordinal", unit="", label="Valvular heart disease",
                values={"N": 0, "mild": 1, "Moderate": 2, "Severe": 3}),
}
# Region RWMA is a clinical (echo) feature ONLY. It is not an anatomical coordinate or lesion
# map and must never be mapped onto the 3D coronary model.

# Verified constant in the audit (one value in 100 % of rows) -> dropped before modelling.
DROP_CONSTANT = ["exertional_cp"]

RISK_FACTORS = ["dm", "htn", "current_smoker", "ex_smoker", "fh", "dlp", "obesity"]
ECG_FLAGS = ["q_wave", "st_elevation", "st_depression", "tinversion", "lvh", "poor_r_progression"]
ISCHEMIC_ECG = ["st_depression", "tinversion", "st_elevation", "q_wave"]
SKEWED_LABS = ["fbs", "cr", "tg", "esr", "bun", "wbc", "plt"]
# Linear/kernel models: BMI already encodes weight + height and Obesity is a BMI threshold.
LINEAR_DROP = ["weight", "length", "obesity"]

# Engineered feature -> raw source features. SHAP of an engineered feature is split equally
# across its sources when explanations are mapped back to raw clinical features.
ENGINEERED_SOURCES = {
    "risk_factor_count": RISK_FACTORS,
    "ecg_abnormal_count": ECG_FLAGS + ["bbb"],
    "ischemic_ecg": ISCHEMIC_ECG,
    "rwma_present": ["region_rwma"],
    "ef_category": ["ef_tte"],
    "chest_pain_type": ["typical_chest_pain", "atypical", "nonanginal"],
    "pretest_prob": ["age", "sex", "typical_chest_pain", "atypical", "nonanginal"],
    "tg_hdl": ["tg", "hdl"],
    "ldl_hdl": ["ldl", "hdl"],
    "nlr": ["neut", "lymph"],
    "abs_lymph": ["wbc", "lymph"],
    "plr": ["plt", "wbc", "lymph"],
    "egfr": ["cr", "age", "sex"],
    "bbb_lbbb": ["bbb"],
    "bbb_rbbb": ["bbb"],
}
ENGINEERED_LABELS = {
    "risk_factor_count": "Risk-factor count", "ecg_abnormal_count": "ECG abnormality count",
    "ischemic_ecg": "Ischaemic ECG", "rwma_present": "RWMA present", "ef_category": "EF category",
    "chest_pain_type": "Chest-pain type", "pretest_prob": "Diamond–Forrester pretest probability",
    "tg_hdl": "TG/HDL ratio", "ldl_hdl": "LDL/HDL ratio", "nlr": "Neutrophil/lymphocyte ratio",
    "abs_lymph": "Absolute lymphocytes", "plr": "Platelet/lymphocyte ratio", "egfr": "eGFR (CKD-EPI 2021)",
}

# Hard physiological limits: inputs outside raise ValueError in predict_patient().
HARD_LIMITS = {
    "age": (18, 110), "weight": (30, 250), "length": (120, 220), "bmi": (12, 70),
    "bp": (60, 260), "pr": (30, 200), "fbs": (30, 700), "cr": (0.2, 15), "tg": (20, 3000),
    "ldl": (5, 400), "hdl": (5, 150), "bun": (2, 150), "esr": (0, 150), "hb": (4, 22),
    "k": (2, 7), "na": (110, 170), "wbc": (1000, 50000), "lymph": (0, 100), "neut": (0, 100),
    "plt": (10, 1500), "ef_tte": (5, 80),
}
# Audit-only plausibility ranges (report, never auto-fix).
SANITY_RANGES = {"ef_tte": (10, 80), "k": (2, 7), "na": (120, 160), "hb": (6, 20),
                 "bp": (70, 230), "pr": (40, 160), "bmi": (14, 60), "cr": (0.3, 10)}

# ----------------------------------------------------------------------------- risk tiers
# Overall cardiac risk tier from calibrated CAD probability. Cut-offs are DERIVED from the
# out-of-fold distribution with this rule and saved in thresholds.json:
#   Low  : p <  t_low,  t_low  = largest threshold that keeps sensitivity >= 0.95
#          (at most 5 % of CAD patients are labelled "Low")
#   High : p >= t_high, t_high = smallest threshold with specificity >= 0.90
#          (at most 10 % of non-CAD patients are labelled "High")
RISK_TIER_RULE = {"low_min_sensitivity": 0.95, "high_min_specificity": 0.90}
RISK_TIER_FALLBACK = {"low": 0.30, "high": 0.70}   # used only if the derived cut-offs cross

DISCLAIMER = ("For decision support and educational purposes only. Not a substitute for "
              "formal diagnostic imaging or clinical judgement.")
