"""Start CardioLens for development: syncs assets, starts FastAPI (:8000) + Vite (:5173), waits for
/api/health, opens the browser. Ctrl+C stops both.

    python scripts/dev.py [--no-browser]
"""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "app" / "frontend"
PY = sys.executable


def wait(url: str, timeout: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def main() -> int:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None:
        print("Node.js (npm) is required: install Node 20+ from https://nodejs.org and run this again.")
        return 1
    if not (FE / "node_modules").exists():
        print("Installing frontend packages (first run only)...")
        subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=FE, check=True)
    subprocess.run([PY, str(ROOT / "scripts" / "sync_assets.py")], check=True)
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    api = subprocess.Popen([PY, "-m", "uvicorn", "app.backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
                           cwd=ROOT, creationflags=flags)
    web = None
    try:
        print("Waiting for the API (loading models)...")
        if not wait("http://127.0.0.1:8000/api/health", 120):
            print("The API did not start - see the log above.")
            return 1
        web = subprocess.Popen([npm, "run", "dev"], cwd=FE, creationflags=flags)
        if not wait("http://127.0.0.1:5173/", 60):
            print("The web app did not start - see the log above.")
            return 1
        print("\nCardioLens is running at http://localhost:5173  (Ctrl+C to stop)\n")
        if "--no-browser" not in sys.argv:
            webbrowser.open("http://localhost:5173")
        while api.poll() is None and web.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for p in (web, api):
            if p is not None and p.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
                else:
                    p.send_signal(signal.SIGINT)
        print("Stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
