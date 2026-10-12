"""The zero-hardcoding guard must pass: the frontend never duplicates data owned by the API / artifacts."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_no_hardcoded_data_in_frontend():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "check_no_hardcoding.py")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_guard_catches_a_planted_literal(tmp_path, monkeypatch):
    """Sanity: the guard really detects hardcoded data (plant a threshold + mesh name in a temp source file)."""
    sys.path.insert(0, str(ROOT / "scripts"))
    import check_no_hardcoding as g

    src = tmp_path / "src"
    src.mkdir()
    (src / "bad.ts").write_text("const t = 0.465; const m = \"Coronary_LAD\"; const f = \"ldl\";\n", encoding="utf-8")
    monkeypatch.setattr(g, "SRC", src)
    problems = g.scan()
    assert any("threshold" in p for p in problems)
    assert any("mesh" in p for p in problems)
    assert any("feature name" in p for p in problems)
