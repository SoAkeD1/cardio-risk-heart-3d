"""Start CardioLens for development: syncs assets, starts FastAPI (:8000, auto-reload on code changes) and
Vite (:5173) TOGETHER, waits for both, opens the browser. Ctrl+C stops both. If the API process exits it is
restarted automatically (the web app reconnects by itself).

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


def kill(p) -> None:
    if p is None or p.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
    else:
        p.send_signal(signal.SIGINT)
    try:
        p.wait(10)
    except Exception:
        pass


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
    # auto-reload on backend / ML package code changes only (relative dirs: uvicorn resolves them against cwd=ROOT)
    api_cmd = [PY, "-m", "uvicorn", "app.backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload",
               "--reload-dir", "app/backend", "--reload-dir", "cardio_ml", "--reload-exclude", "*/tests/*"]
    # The API runs in its OWN hidden console: on Windows, uvicorn's reloader restarts its worker with a console
    # CTRL+C event that would otherwise also hit this script (and stop both servers). Output still streams here.
    api_flags = flags | (getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0)

    def start_api():
        return subprocess.Popen(api_cmd, cwd=ROOT, creationflags=api_flags, stdin=subprocess.DEVNULL,
                                stdout=sys.stdout, stderr=sys.stderr)

    api = start_api()
    web = subprocess.Popen([npm, "run", "dev"], cwd=FE, creationflags=flags)   # both servers start together
    try:
        print("Waiting for the API (loading models)...")
        if not wait("http://127.0.0.1:8000/api/health", 180):
            print("The API did not start - see the log above.")
            return 1
        if not wait("http://localhost:5173/", 90):
            print("The web app did not start - see the log above.")
            return 1
        print("\nCardioLens is running at http://localhost:5173  (Ctrl+C to stop)\n")
        if "--no-browser" not in sys.argv:
            webbrowser.open("http://localhost:5173")
        last_ok = time.time()
        while web.poll() is None:
            # watchdog: restart the API if its process exited, or if /api/health has not answered for 60 s (longer
            # than a code reload, which reloads the models in ~15 s; a crashed worker can leave the reloader alive).
            # The web app reconnects and re-sends the patient by itself.
            try:
                if wait("http://127.0.0.1:8000/api/health", 2):
                    last_ok = time.time()
                if api.poll() is not None or time.time() - last_ok > 60:
                    print("The API is not answering - restarting it...")
                    kill(api)
                    api = start_api()
                    wait("http://127.0.0.1:8000/api/health", 180)
                    last_ok = time.time()
            except Exception as e:                     # never let the watchdog take the dev servers down
                print(f"watchdog: {e!r}")
            time.sleep(2)
        print(f"The web server exited (code {web.returncode}).")
    except KeyboardInterrupt:
        print("Ctrl+C received.")
    except BaseException as e:
        print(f"dev.py stopped by {e!r}")
    finally:
        for p in (web, api):
            kill(p)
        print("Stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
