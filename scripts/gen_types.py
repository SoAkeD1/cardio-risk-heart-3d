"""Export the FastAPI OpenAPI schema and generate TypeScript types for the frontend.

    python scripts/gen_types.py      -> app/frontend/openapi.json + app/frontend/src/api/types.gen.ts
The OpenAPI document is built from the app factory (no server needed, models are not loaded)."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    from app.backend.main import create_app
    spec = create_app().openapi()
    out = ROOT / "app" / "frontend" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(spec, indent=1), encoding="utf-8")
    print(f"OpenAPI ({len(spec['paths'])} paths) -> {out.relative_to(ROOT)}")
    fe = ROOT / "app" / "frontend"
    if not (fe / "node_modules" / "openapi-typescript").exists():
        print("openapi-typescript not installed yet (run npm install in app/frontend); skipped TS generation")
        return 0
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    ts = fe / "src" / "api" / "types.gen.ts"
    ts.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([npx, "openapi-typescript", str(out), "-o", str(ts)], cwd=fe, check=True)
    print(f"TypeScript types -> {ts.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
