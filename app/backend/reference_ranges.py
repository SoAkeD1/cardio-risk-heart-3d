"""Adult reference ranges for DISPLAY ONLY (normal-range band on sliders, "within / above / below" text).

These values are never fed to the model and never change a prediction. They are general adult ranges in the
same units as the dataset (conventional US units), rounded to the values most labs print. Sources:
  * BP: 2017 ACC/AHA Hypertension Guideline (normal systolic < 120 mmHg; 90 used as the low bound).
  * PR: AHA "All about heart rate" (60-100 bpm resting adult).
  * FBS: ADA Standards of Care 2024 (normal fasting glucose 70-99 mg/dL).
  * Lipids (TG, LDL, HDL): NCEP ATP III / NIH NHLBI (TG < 150, LDL < 100 optimal, HDL >= 40 mg/dL).
  * CR, BUN, Na, K, Hb, WBC, PLT, ESR, differential: MedlinePlus (U.S. National Library of Medicine) lab test
    reference pages and Merck Manual Professional "Normal laboratory values" (adult, both sexes combined).
  * EF-TTE: ASE/EACVI 2015 chamber quantification guideline (normal LVEF >= 52-54%; 55-70% used).
  * BMI: WHO adult classification (normal 18.5-24.9 kg/m2).
Sex-specific ranges (Hb, CR) are simplified to a combined adult range; the UI says "typical adult range".
"""
from __future__ import annotations

REFERENCE_RANGES: dict[str, tuple[float, float]] = {
    "bp": (90, 120),        # systolic, mmHg
    "pr": (60, 100),        # bpm
    "fbs": (70, 99),        # mg/dL
    "cr": (0.6, 1.3),       # mg/dL
    "tg": (0, 150),         # mg/dL
    "ldl": (0, 100),        # mg/dL (optimal)
    "hdl": (40, 100),       # mg/dL
    "bun": (7, 20),         # mg/dL
    "esr": (0, 20),         # mm/h
    "hb": (12, 17.5),       # g/dL
    "k": (3.5, 5.0),        # mEq/L
    "na": (135, 145),       # mEq/L
    "wbc": (4000, 11000),   # cells/uL
    "lymph": (20, 40),      # %
    "neut": (40, 70),       # %
    "plt": (150, 450),      # x10^3/uL
    "ef_tte": (55, 70),     # %
    "bmi": (18.5, 24.9),    # kg/m2
}


def status(name: str, value) -> str | None:
    """'within' / 'above' / 'below' the reference range, or None when no range applies."""
    rng = REFERENCE_RANGES.get(name)
    if rng is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return "below" if v < rng[0] else "above" if v > rng[1] else "within"
