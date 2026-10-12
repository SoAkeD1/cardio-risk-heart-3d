"""CardioLens API (FastAPI). Run:  python -m app.backend.main   (or uvicorn app.backend.main:app)

* Loads CardioPredictor + anatomy_map ONCE at startup (lifespan) and keeps them in app.state.
* All ML logic comes from cardio_ml; routers are thin.
* One error shape: {"error": {"code", "message", "fields"?}}.
* In production the built SPA (app/frontend/dist) is served from "/" on the same origin.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .routers import assets, education, examples, health, modelcard, predict, schema, sensitivity, whatif
from .services import ApiError, Services
from .settings import get_settings

log = logging.getLogger("cardiolens")


def _err(status: int, code: str, message: str, fields: dict | None = None) -> ORJSONResponse:
    body = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return ORJSONResponse({"error": body}, status_code=status)


def _field_messages(exc: RequestValidationError) -> dict[str, str]:
    out = {}
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", []) if x != "body"]
        key = loc[-1] if loc else "body"
        if len(loc) >= 2 and loc[0] == "features":
            key = loc[1]
        msg = e.get("msg", "Invalid value")
        out[key] = msg[0].upper() + msg[1:] + "."
    return out


def create_app(services: Services | None = None) -> FastAPI:
    st = get_settings()
    logging.basicConfig(level=st.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = services or Services(st.ARTIFACTS_DIR).load()
        yield

    app = FastAPI(title="CardioLens API", version=st.VERSION, default_response_class=ORJSONResponse,
                  lifespan=lifespan,
                  description="Calibrated CAD and per-artery stenosis risk with explanations, what-if and a "
                              "render-ready 3D scene state. Decision support and education only.")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if st.ENV != "prod" and st.CORS_ORIGINS:
        app.add_middleware(CORSMiddleware, allow_origins=st.CORS_ORIGINS, allow_methods=["GET", "POST"],
                           allow_headers=["Content-Type"])

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return _err(exc.status, exc.code, exc.message, exc.fields)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = _field_messages(exc)
        return _err(422, "validation_error", f"{len(fields)} field{'s' if len(fields) != 1 else ''} could not be used.",
                    fields)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        return _err(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")
        return _err(500, "internal_error", "Something went wrong on the server. Please try again.")

    for r in (health, schema, examples, predict, whatif, sensitivity, modelcard, assets, education):
        app.include_router(r.router, prefix="/api")

    dist = Path(st.FRONTEND_DIST)
    if dist.is_dir():
        _mount_spa(app, dist)
    return app


def _mount_spa(app: FastAPI, dist: Path) -> None:
    """Serve the built SPA: hashed assets + models are immutable; everything else falls back to index.html."""
    index = dist / "index.html"
    immutable = {"Cache-Control": "public, max-age=31536000, immutable"}

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return _err(404, "not_found", "Unknown API route.")
        f = (dist / path).resolve()
        if path and f.is_file() and dist.resolve() in f.parents:
            hashed = path.startswith("assets/") or path.startswith("models/") or path.startswith("decoders/") \
                or path.startswith("fonts/") or path.startswith("env/")
            return FileResponse(f, headers=immutable if hashed else {"Cache-Control": "public, max-age=3600"})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":                    # `python -m app.backend.main` = the production single server
    import os
    os.environ.setdefault("CARDIOLENS_ENV", "prod")

app = create_app()

def _serve(port: int = 8000) -> None:
    """Production entry. Listens on BOTH loopback addresses (::1 and 127.0.0.1, never other interfaces), so
    http://localhost:8000 connects instantly whichever address the OS resolves first (on Windows an IPv4-only
    server costs ~200 ms per connection while ::1 is tried and refused)."""
    import asyncio
    import socket

    import uvicorn

    socks = []
    for fam, host in ((socket.AF_INET6, "::1"), (socket.AF_INET, "127.0.0.1")):
        try:
            sk = socket.socket(fam, socket.SOCK_STREAM)
            if fam == socket.AF_INET6:
                sk.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            sk.bind((host, port))
            sk.set_inheritable(True)
            socks.append(sk)
        except OSError as e:
            log.warning("could not bind %s:%s (%s)", host, port, e)
    if not socks:
        raise SystemExit(f"Port {port} is busy - stop the other server and try again.")
    server = uvicorn.Server(uvicorn.Config(app, log_level="info"))
    print(f"CardioLens running at http://localhost:{port}  (Ctrl+C to stop)")
    asyncio.run(server.serve(sockets=socks))


if __name__ == "__main__":
    _serve()
