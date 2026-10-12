"""One-click start for CardioLens (used by "Start CardioLens.bat"). Runs independently of any editor or AI tool.

* builds the web app first if it is missing or older than its sources
* starts the production server on http://localhost:8000 (or reuses one that is already running)
* opens the browser when the server answers
* keeps it alive: if the server process ever exits, it is restarted automatically
Close the window (or press Ctrl+C) to stop.
"""
from __future__ import annotations

import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "app" / "frontend"
DIST = FE / "dist" / "index.html"
URL = "http://localhost:8000"
OPEN_BROWSER = "--no-browser" not in sys.argv


def healthy(timeout: float = 2) -> bool:
    try:
        with urllib.request.urlopen(f"{URL}/api/health", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def needs_build() -> bool:
    if not DIST.exists():
        return True
    built = DIST.stat().st_mtime
    sources = [p for d in ("src", "public") for p in (FE / d).rglob("*") if p.is_file()]
    sources += [FE / "index.html", FE / "package.json", FE / "vite.config.ts"]
    return any(p.exists() and p.stat().st_mtime > built for p in sources)


def main() -> int:
    print("CardioLens - starting...\n")
    if healthy():
        print(f"Already running at {URL}")
        if OPEN_BROWSER:
            webbrowser.open(URL)
        return 0
    if needs_build():
        print("Building the web app (first run or after an update, ~1 min)...")
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py")], cwd=ROOT)
        if r.returncode != 0:
            print("\nBuild failed - see the messages above.")
            input("Press Enter to close.")
            return 1
    opened = False
    while True:
        server = subprocess.Popen([sys.executable, "-m", "app.backend.main"], cwd=ROOT)
        print("Loading the models (about 15 s)...")
        t0 = time.time()
        while server.poll() is None and not healthy() and time.time() - t0 < 180:
            time.sleep(1)
        if healthy():
            print(f"\nCardioLens is running at {URL}\nKeep this window open; close it to stop.\n")
            if not opened and OPEN_BROWSER:
                webbrowser.open(URL)
                opened = True
        try:
            server.wait()
        except KeyboardInterrupt:
            server.terminate()
            print("Stopped.")
            return 0
        print("The server stopped unexpectedly - restarting in 3 s...")
        time.sleep(3)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Stopped.")
