# Track A: ML summary (Steps 1–4)

**Data.** Extension of Z-Alizadeh Sani (UCI id 411): 303 patients, 55 features, 4 binary targets
(Cath/CAD 71%, LAD 58%, LCX 39%, RCA 38% positive). There are no missing values or duplicates, and nothing was
relabelled. `Exertional CP` is constant and was dropped. Every CAD patient has ≥ 1 stenotic vessel
(1 "Normal" patient has a recorded stenotic vessel).

**Preprocessing.** Deterministic encoding (Y/N → 1/0, Sex, BBB one-hot, VHD / Function Class / Region RWMA ordinal),
plus engineered features: risk-factor count, ECG-abnormality count, ischaemic ECG, RWMA present, EF category,
chest-pain type, **Diamond–Forrester pretest probability**, TG/HDL, LDL/HDL, NLR, PLR, absolute lymphocytes and
**eGFR (CKD-EPI 2021)**. Linear and SVM models also get log1p, standardisation and drop weight/height/obesity
(collinear with BMI). Everything is a fitted-in-fold sklearn transformer inside `cardio_ml/`.

**Validation.** Stratified 20% hold-out (n=61, used once). On the 80% split: repeated stratified
5×5 CV with **nested** Optuna tuning (inner 3-fold), fold thresholds from
inner OOF, and all preprocessing inside the folds. Hold-out CIs use 1000 stratified bootstrap resamples. Labels are
never inputs (asserted before every fit).

**Models.** LR (ElasticNet), RBF-SVM, RF, ExtraTrees, LightGBM (in-fold early stopping), XGBoost, CatBoost,
soft-vote and stacking ensembles of the top 3 diverse families. TabPFN: skipped (tabpfn.errors.TabPFNLicenseError: TabPFN requires a one-time license acceptance to downloa).
Vessel strategy: **A** (A independent / B chain / C hierarchical P(CAD)·P(vessel|CAD)).
Calibration: cad=sigmoid, lad=sigmoid, lcx=sigmoid, rca=sigmoid.

**Results.**

| Target     | Model                        | Nested-CV AUC   | Hold-out AUC [95% CI]   | Hold-out F1 [95% CI]   |   Hold-out Brier |   Hold-out Acc | Top-5 drivers                                                                                              |
|:-----------|:-----------------------------|:----------------|:------------------------|:-----------------------|-----------------:|---------------:|:-----------------------------------------------------------------------------------------------------------|
| CAD (Cath) | stack(svm+lr+xgb)            | 0.945 ± 0.036   | 0.895 [0.806, 0.966]    | 0.905 [0.869, 0.945]   |            0.118 |          0.852 | Typical chest pain, EF-TTE (ejection fraction), Age, Fasting blood sugar, ESR                              |
| LAD        | svm · strategy A             | 0.869 ± 0.053   | 0.832 [0.725, 0.930]    | 0.805 [0.734, 0.877]   |            0.166 |          0.754 | Typical chest pain, Regional wall-motion abnormality, EF-TTE (ejection fraction), Atypical chest pain, Age |
| LCX        | rf · strategy A              | 0.740 ± 0.069   | 0.768 [0.647, 0.878]    | 0.714 [0.641, 0.788]   |            0.193 |          0.672 | Age, Platelets, Fasting blood sugar, Creatinine, Height                                                    |
| RCA        | vote(lr+svm+et) · strategy A | 0.737 ± 0.054   | 0.741 [0.598, 0.868]    | 0.596 [0.491, 0.702]   |            0.191 |          0.623 | Diabetes mellitus, Age, ESR, Neutrophils, Lymphocytes                                                      |

Risk tiers (calibrated CAD probability): Low < 0.08 ≤ Moderate < 0.82 ≤ High,
chosen so that ≤ 5% of CAD patients fall in Low and ≤ 10% of non-CAD patients fall in High (OOF).

**Explainability.** Exact TreeSHAP / LinearSHAP per member, propagated through ensembling, calibration and the
vessel hierarchy, expressed in probability points and mapped to raw clinical features and 6 physiological
groups. LIME agrees with SHAP on 3.1 / 5 of the top-5 features on average.
`predict_patient()` with explanations takes **149 ms** (p95 150 ms) on CPU.

**Limitations.** Single-centre cohort (Tehran) of 303 patients with a high CAD prevalence (71%) from a
referral population, so the probabilities and tiers will not transfer to screening populations without
recalibration. There is no external validation. The hold-out has only 61 patients, so its CIs are wide.
Vessel labels are binary ≥ 50% stenosis with no lesion location, and Region RWMA is **not** an anatomical
map. The Diamond–Forrester table dates from 1979 and overestimates modern prevalence. Creatinine is assumed
to be in mg/dL. Height appears among LCX's top-5 drivers; with n = 303 this is most likely a spurious correlation (e.g. confounded by sex), not a physiological effect. For decision support and educational purposes only. Not a substitute for formal diagnostic imaging or clinical judgement.
