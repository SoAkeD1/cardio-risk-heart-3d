"""Local static server for blender/preview.html (+ POST /save?name=web_preview.png to store a screenshot).

    python blender/serve_preview.py        -> http://localhost:8765/blender/preview.html
"""
from __future__ import annotations

import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
FIGS = ROOT / "artifacts" / "figures"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".glb": "model/gltf-binary", ".js": "text/javascript"}

    def do_POST(self):
        url = urlparse(self.path)
        name = parse_qs(url.query).get("name", [""])[0]
        if url.path != "/save" or not re.fullmatch(r"[\w\-]+\.png", name):
            self.send_error(400, "only POST /save?name=<file>.png")
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if not data.startswith(b"\x89PNG"):
            self.send_error(400, "not a PNG")
            return
        (FIGS / name).write_bytes(data)
        self.send_response(201)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT))).serve_forever()
