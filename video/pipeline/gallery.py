"""Devpost image gallery: 3:2 (1800x1200) JPGs < 5 MB, real app frames (no captions) with a short title.

    python video/pipeline/gallery.py [hero.png]   ->  video/out/gallery/NN_name.jpg
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

VIDEO = Path(__file__).resolve().parents[1]
ROOT = VIDEO.parent
OUT = VIDEO / "out" / "gallery"
W, H = 1800, 1200
BG, T1, T2, ACC = (15, 16, 18), (242, 240, 237), (167, 163, 157), (95, 179, 168)
F_B = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 46)
F_R = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 28)
F_S = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)


def frame(clip: str, mark: str | None = None, offset: float = 0.0, at: float | None = None) -> Image.Image:
    meta = json.loads((VIDEO / "raw" / f"{clip}.json").read_text(encoding="utf-8"))
    t = at if at is not None else next(m["t"] for m in meta["marks"] if m["name"] == mark) + offset
    tmp = OUT / "_frame.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{meta['handle'] + t:.3f}", "-i", str(VIDEO / "raw" / f"{clip}.mp4"),
                    "-frames:v", "1", str(tmp)], check=True)
    return Image.open(tmp).convert("RGB")


def split(img: Image.Image) -> list[Image.Image]:
    """heart canvas + results column side by side, so the panel text is large enough to read"""
    return [img.crop((480, 120, 1500, 1030)), img.crop((1512, 120, 1912, 1030))]


def card(img: Image.Image | list[Image.Image], title: str, sub: str) -> Image.Image:
    c = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, W, 6], fill=ACC)
    d.text((60, 40), title, font=F_B, fill=T1)
    d.text((62, 104), sub, font=F_R, fill=T2)
    area = (60, 170, W - 60, H - 70)  # x0, y0, x1, y1
    imgs = img if isinstance(img, list) else [img]
    gap = 40
    aw, ah = area[2] - area[0], area[3] - area[1]
    scale = min((aw - gap * (len(imgs) - 1)) / sum(i.width for i in imgs), ah / max(i.height for i in imgs))
    sized = [i.resize((round(i.width * scale), round(i.height * scale)), Image.LANCZOS) for i in imgs]
    total = sum(s.width for s in sized) + gap * (len(sized) - 1)
    x = area[0] + (aw - total) // 2
    for s in sized:
        y = area[1] + (ah - s.height) // 2
        d.rounded_rectangle([x - 3, y - 3, x + s.width + 2, y + s.height + 2], radius=10, outline=(48, 52, 58), width=3)
        c.paste(s, (x, y))
        x += s.width + gap
    d.text((60, H - 50), "CardioLens · Team HAVOC · decision support & education only, not a diagnosis", font=F_S, fill=(124, 120, 114))
    return c


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    hero = Image.open(sys.argv[1]).convert("RGB") if len(sys.argv) > 1 else frame("s05f_3d", at=1.0)
    shots = [
        ("01_dashboard", hero, "CardioLens: cardiac risk on a 3D heart",
         "55 routine inputs (left) → calibrated CAD + per-artery stenosis risk (right), painted on each artery"),
        ("02_artery_select", frame("s05f_3d", "click_lad", 1.4), "Click an artery: the camera flies there",
         "Probability, threshold and reliability per artery; selection syncs the 3D view, cards and explanation"),
        ("03_live_change", frame("s05d_live", "toast_htn", 0.6), "Every change updates the estimate live",
         "Hypertension off → a toast reports the change per target (CAD −21 pts)"),
        ("04_why_shap", split(frame("s05i_why", "why", 2.6)), "Why? SHAP in probability points",
         "Waterfall from the base rate to this patient, for CAD and for each artery (requirement 3b)"),
        ("05_breakdown", split(frame("s05i_why", "table", 0.4)), "Physiological breakdown",
         "Each measurement beside its typical range and its contribution, sortable (requirement 3c)"),
        ("06_what_if", split(frame("s05j_whatif", "show", 1.2)), "What-if on modifiable factors",
         "Before / after / Δ table, preview on the heart, sensitivity chart; model associations, not treatment effects"),
        ("07_body_mode", frame("s05h_body", "body", 4.5), "Body mode with x-ray",
         "Where contributing factors live (lungs, kidneys, blood…), not where the disease is"),
        ("08_territories", frame("s05h_body", "territories", 2.4), "Perfusion territories",
         "AHA 17-segment territories (right-dominant), shaded in each artery's risk colour and outlined"),
        ("09_model_card", frame("s05k_modelcard", "metrics", 1.2), "Model card: honest metrics",
         "Hold-out ROC-AUC with 95% CIs: CAD 0.895 · LAD 0.832 · LCX 0.768 · RCA 0.741, plus validation and limitations"),
        ("10_samples", frame("s05b_samples", "menu", 1.4), "Six real hold-out sample patients",
         "From clearly low risk to a deliberate model-uncertainty example; each has its own link"),
        ("11_devices", [frame("s05n_tablet", at=3.0), frame("s05n_phone", at=7.0)], "Tablet and phone layouts",
         "Bottom sheet on tablets, tabs on phones; a lighter 3D model loads automatically on weaker devices"),
    ]
    for name, img, title, sub in shots:
        out = OUT / f"{name}.jpg"
        card(img, title, sub).save(out, "JPEG", quality=92, optimize=True)
        print(f"{out.name:24s} {out.stat().st_size / 1e6:.2f} MB")
    (OUT / "_frame.png").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
