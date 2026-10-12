"""Production build: sync assets, regenerate API types, build the SPA. Afterwards one server serves
everything on :8000:

    python scripts/build.py
    python -m app.backend.main        -> http://localhost:8000
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "app" / "frontend"


def main() -> int:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None:
        print("Node.js (npm) is required: https://nodejs.org")
        return 1
    if not (FE / "node_modules").exists():
        subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=FE, check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "sync_assets.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "gen_types.py")], check=True)
    env = {**os.environ, "CARDIOLENS_TEST_HOOKS": os.environ.get("CARDIOLENS_TEST_HOOKS", "0")}
    subprocess.run([npm, "run", "build"], cwd=FE, check=True, env=env)
    print("\nBuilt app/frontend/dist. Start the production server with:\n    python -m app.backend.main\n"
          "then open http://localhost:8000")
    return 0


if __name__ == "__main__":
    sys.exit(main())
