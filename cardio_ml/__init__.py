"""cardio_ml - Track A ML pipeline (Z-Alizadeh Sani CAD + per-vessel stenosis risk).

Modules: config, data, features, models, evaluation, vessels, explain, plots, predict, anatomy (Step 5).
"""
from .config import DISCLAIMER  # noqa: F401

__version__ = "1.0.0"


def predict_patient(patient_dict, k=8):
    from .predict import predict_patient as _p
    return _p(patient_dict, k=k)


def explain_patient(patient_dict, k=8):
    from .predict import explain_patient as _e
    return _e(patient_dict, k=k)
