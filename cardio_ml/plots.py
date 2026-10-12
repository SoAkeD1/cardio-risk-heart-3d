"""Plot helpers. Every figure is saved to artifacts/figures at 150 dpi."""
from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import ConfusionMatrixDisplay, precision_recall_curve, roc_curve

from . import config as C

PALETTE = {"cad": "#b2182b", "lad": "#2166ac", "lcx": "#1b7837", "rca": "#762a83"}


def save(fig, name: str):
    C.FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(C.FIG_DIR / f"{name}.png", dpi=150, bbox_inches="tight")
    return C.FIG_DIR / f"{name}.png"


def target_balance(Y: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(7, 3.2))
    pos = Y.mean() * 100
    ax.barh([C.TARGET_DISPLAY[t] for t in Y.columns], pos, color=[PALETTE[t] for t in Y.columns])
    ax.barh([C.TARGET_DISPLAY[t] for t in Y.columns], 100 - pos, left=pos, color="#dddddd")
    for i, (t, v) in enumerate(pos.items()):
        ax.text(v / 2, i, f"{int(Y[t].sum())} pos ({v:.0f}%)", va="center", ha="center",
                color="white", fontsize=9)
    ax.set_xlim(0, 100)
    ax.set_xlabel("% of patients")
    ax.set_title("Target balance (n = %d)" % len(Y))
    return fig


def cooccurrence(Y: pd.DataFrame):
    co = Y.T.dot(Y)
    fig, ax = plt.subplots(figsize=(4.8, 4))
    im = ax.imshow(co, cmap="Reds")
    labels = [C.TARGET_DISPLAY[t] for t in Y.columns]
    ax.set_xticks(range(len(labels)), labels, rotation=30)
    ax.set_yticks(range(len(labels)), labels)
    for i in range(len(co)):
        for j in range(len(co)):
            ax.text(j, i, int(co.iloc[i, j]), ha="center", va="center",
                    color="white" if co.iloc[i, j] > co.values.max() / 2 else "black")
    fig.colorbar(im, ax=ax, shrink=0.8)
    ax.set_title("Target co-occurrence (patients positive for both)")
    return fig


def roc_pr_cal_cm(y, p, thr, title):
    fig, axes = plt.subplots(1, 4, figsize=(17, 3.9))
    fpr, tpr, _ = roc_curve(y, p)
    axes[0].plot(fpr, tpr, lw=2)
    axes[0].plot([0, 1], [0, 1], "k--", lw=0.8)
    axes[0].set(xlabel="1 - specificity", ylabel="Sensitivity", title="ROC")
    pr, rc, _ = precision_recall_curve(y, p)
    axes[1].plot(rc, pr, lw=2)
    axes[1].axhline(np.mean(y), color="k", ls="--", lw=0.8)
    axes[1].set(xlabel="Recall", ylabel="Precision", title="Precision-recall")
    fx, fy = calibration_curve(y, p, n_bins=5, strategy="quantile")
    axes[2].plot(fy, fx, "o-", lw=2)
    axes[2].plot([0, 1], [0, 1], "k--", lw=0.8)
    axes[2].set(xlabel="Predicted probability", ylabel="Observed frequency", title="Calibration")
    ConfusionMatrixDisplay.from_predictions(y, (np.asarray(p) >= thr).astype(int), ax=axes[3],
                                            colorbar=False, display_labels=["Normal", "Positive"])
    axes[3].set_title(f"Confusion @ thr={thr:.2f}")
    fig.suptitle(title, y=1.03, fontsize=12)
    fig.tight_layout()
    return fig


def reliability(curves: dict, title: str):
    """curves: {label: (y, p)}"""
    fig, ax = plt.subplots(figsize=(4.8, 4.4))
    ax.plot([0, 1], [0, 1], "k--", lw=0.8)
    for label, (y, p) in curves.items():
        fx, fy = calibration_curve(y, p, n_bins=8, strategy="quantile")
        ax.plot(fy, fx, "o-", label=label)
    ax.set(xlabel="Predicted probability", ylabel="Observed frequency", title=title)
    ax.legend(fontsize=8)
    return fig


def bar_with_err(df: pd.DataFrame, value: str, err: str, title: str, xlabel: str, xlim=None):
    df = df.sort_values(value)
    fig, ax = plt.subplots(figsize=(6.5, 0.32 * len(df) + 1.2))
    ax.barh(df.index.astype(str), df[value], xerr=df[err], color="#4575b4", alpha=0.85)
    ax.set(xlabel=xlabel, title=title)
    if xlim:
        ax.set_xlim(*xlim)
    return fig


def _bezier(pts, n=60):
    """Cubic/quadratic Bezier curve through control points (de Casteljau) -> (n, 2) array."""
    t = np.linspace(0, 1, n)[:, None]
    curve = [np.asarray(p, float)[None, :].repeat(n, 0) for p in pts]
    while len(curve) > 1:
        curve = [(1 - t) * a + t * b for a, b in zip(curve[:-1], curve[1:])]
    return curve[0]


# Schematic (anterior view) geometry for the 2D preview only - NOT a contract for the 3D model.
_SCHEMATIC = {
    "Coronary_LM": [(0.05, 0.62), (0.14, 0.60), (0.20, 0.57)],
    "Coronary_LAD": [(0.20, 0.57), (0.16, 0.35), (0.05, 0.10), (-0.02, -0.38)],
    "Coronary_LCX": [(0.20, 0.57), (0.42, 0.55), (0.52, 0.35), (0.50, 0.12)],
    "Coronary_RCA": [(-0.05, 0.60), (-0.38, 0.52), (-0.50, 0.15), (-0.30, -0.22)],
}


def coronary_schematic(scene: dict, title: str):
    """2D sanity preview of a scene state: vessels coloured exactly as the 3D view would be,
    flags drawn as halo + badge (non-colour cue), legend with per-vessel threshold markers."""
    from matplotlib.patches import Ellipse, FancyBboxPatch
    from matplotlib.colors import LinearSegmentedColormap
    meshes, vessels, heart = scene["meshes"], scene["vessels"], scene["heart"]
    fig = plt.figure(figsize=(10.5, 6.2))
    ax = fig.add_axes([0.0, 0.08, 0.58, 0.84])
    ax.set_xlim(-0.8, 0.8)
    ax.set_ylim(-0.6, 1.0)
    ax.set_aspect("equal")
    ax.axis("off")
    myo = meshes["Heart_Myocardium"]
    ax.add_patch(Ellipse((0.0, 0.12), 1.15, 1.05, angle=-25, fc=myo["color"], ec="#8a7f74", lw=1.2, alpha=0.9))
    ax.add_patch(FancyBboxPatch((-0.12, 0.62), 0.2, 0.32, boxstyle="round,pad=0.02",
                                fc=meshes["Aorta"]["color"], ec="#8a7f74"))
    ax.text(-0.02, 0.97, "Aorta", ha="center", fontsize=8, color="#555")
    for name, pts in _SCHEMATIC.items():
        xy = _bezier(pts)
        m = meshes[name]
        if m.get("flagged"):
            ax.plot(xy[:, 0], xy[:, 1], color=m["outline_color"] or "white", lw=16, alpha=0.9,
                    solid_capstyle="round", zorder=2)
            ax.plot(xy[:, 0], xy[:, 1], color="black", lw=13, alpha=0.9, solid_capstyle="round", zorder=2.5,
                    ls=(0, (1.2, 1.2)))
        ax.plot(xy[:, 0], xy[:, 1], color=m["color"], lw=9, solid_capstyle="round", zorder=3)
        key = m.get("target")
        end = xy[-1]
        if key in vessels:
            v = vessels[key]
            txt = f"{key.upper()}  {v['prob']:.0%}\nreliability: {v['reliability']}"
            if v["flagged"]:
                txt = "⚠ " + (v["badge"] or "") + "\n" + txt
            ax.annotate(txt, end, xytext=(end[0] + (0.08 if end[0] >= 0 else -0.08), end[1] - 0.08),
                        fontsize=8.5, ha="left" if end[0] >= 0 else "right", va="top",
                        bbox=dict(boxstyle="round", fc="white", ec="black" if v["flagged"] else "#bbb",
                                  lw=1.4 if v["flagged"] else 0.6))
        else:
            ax.text(*(xy[len(xy) // 2] + [0, 0.05]), "LM (not modelled)", fontsize=7, color="#666", ha="center")
    ax.set_title(title, fontsize=11)
    # legend: shared colour scale + per-vessel threshold markers
    lax = fig.add_axes([0.80, 0.50, 0.04, 0.40])
    stops = scene["legend"]["stops"]
    from cardio_ml.anatomy import color_for
    grid = np.linspace(0, 1, 101)
    cmap = LinearSegmentedColormap.from_list("risk", [color_for(g) for g in grid])
    lax.imshow(grid[:, None], aspect="auto", cmap=cmap, extent=(0, 1, 0, 1), origin="lower")
    lax.set_xticks([])
    lax.yaxis.tick_right()
    lax.set_yticks([s["p"] for s in stops], [f"{s['p']:.0%}" for s in stops])
    last = -1.0
    for k, thr in sorted(scene["legend"]["threshold_markers"].items(), key=lambda kv: kv[1]):
        lax.axhline(thr, color="black", lw=1, ls="--")
        y = max(thr, last + 0.05)                      # stagger labels of nearby thresholds
        lax.text(-0.15, y, f"{k.upper()} thr {thr:.2f}", fontsize=7, ha="right", va="center",
                 transform=lax.get_yaxis_transform())
        last = y
    lax.set_title("P(≥50% stenosis)", fontsize=8)
    info = (f"CAD probability: {heart['cad_prob']:.0%}  (threshold {heart['threshold']:.0%})\n"
            f"Risk tier: {heart['risk_tier']}\n"
            f"Expected stenotic vessels: {heart['expected_stenotic_vessels']:.2f} / 3\n\n"
            "Colour = calibrated probability (one scale)\n"
            "Dashed halo + ⚠ badge = at/above that vessel's\n  decision threshold\n"
            "Whole vessel coloured: no lesion location in data")
    fig.text(0.70, 0.40, info, fontsize=8.2, va="top")
    fig.text(0.02, 0.02, scene["disclaimer"], fontsize=7, color="#555")
    return fig
