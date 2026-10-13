# CardioLens: cardiac risk on an interactive 3D heart · Team HAVOC

**Title (64 chars):** CardioLens: cardiac risk on an interactive 3D heart · Team HAVOC

## Description
CardioLens takes 55 routine clinical measurements and shows a calibrated probability of coronary artery disease
(CAD) and of ≥50% stenosis in each main coronary artery (LAD, LCX, RCA), painted onto an interactive 3D heart,
with SHAP explanations, a physiological breakdown and live what-if exploration.
Multimodal AI Hackathon 2026 · Track A: Cardiovascular Risk Visualization & Prediction · Team HAVOC.

Hold-out ROC-AUC (n = 61, 95% CI): CAD 0.895 [0.806, 0.966] ·
LAD 0.832 [0.725, 0.930] · LCX 0.768 [0.647, 0.878] ·
RCA 0.741 [0.598, 0.868].

**Features:** sample patients · schema-driven input form · live prediction with change feedback · rotate / zoom /
select arteries · realistic & clinical looks · body mode & perfusion territories · SHAP waterfall + physiological
breakdown · what-if with sensitivity chart · model card · PDF export · responsive tablet & phone layouts.

**Tech stack:** Python · scikit-learn · XGBoost · LightGBM · CatBoost · SHAP · LIME · Optuna · FastAPI · React ·
TypeScript · three.js · React Three Fiber · Blender (asset build) · Vercel (container service) · Docker.

**Live app:** https://havoc-rho.vercel.app
**Code:** https://github.com/SoAkeD1/cardio-risk-heart-3d

## Chapters
0:00 Cold open
0:13 The problem
0:43 The app
4:21 Data & machine learning
5:41 From prediction to anatomy
6:25 Building the 3D heart
7:08 Engineering & quality
7:59 Honesty & close

## Credits & licences
- Dataset: Alizadehsani R., Roshanzamir M., Sani Z. Extension of Z-Alizadeh Sani. UCI ML Repository, id 411 (2017). DOI 10.24432/C5Q31M.
- 3D heart: This work is based on "Realistic Human Heart" (https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089) by neshallads (https://sketchfab.com/neshallads) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
- HDRI: Poly Haven (CC0)
- Narration: recorded by the presenter (Team HAVOC). No music.

## Disclaimer
For decision support and educational purposes only. Not a substitute for formal diagnostic imaging or clinical judgement.

## Tags
CardioLens, coronary artery disease, CAD, stenosis, LAD, LCX, RCA, cardiovascular risk, machine learning, SHAP,
explainable AI, calibration, 3D visualization, React Three Fiber, three.js, FastAPI, medical AI, hackathon,
Z-Alizadeh Sani, Team HAVOC
