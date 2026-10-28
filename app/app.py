from __future__ import annotations

import json
import math
import mimetypes
import os
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
ASSET_DIR = APP_DIR / "assets"
DATA_DIR = Path(os.environ.get("DATA_DIR", APP_DIR.parent / "data")).resolve()
SETTINGS_PATH = DATA_DIR / "microbiota_vaginal_settings.json"
SETTINGS_LOCK = threading.Lock()


def load_settings() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_PATH.exists():
        return {}
    try:
        settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        if not isinstance(settings, dict):
            return {}
        total = settings.get("curves", {}).get("total", {})
        # Repair only the known Cy5 calibration whose intercept was saved as zero.
        if total.get("m") == -3.839 and total.get("b") == 0:
            total["b"] = 36.094
            save_settings(settings)
        return settings
    except (json.JSONDecodeError, OSError):
        return {}


def save_settings(settings: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SETTINGS_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(SETTINGS_PATH)


def validate_calibration(settings: dict) -> None:
    for curve in settings.get("curves", {}).values():
        m, b, factor = (float(curve.get(key, default)) for key, default in (("m", 0), ("b", 0), ("factor", 1)))
        if not all(math.isfinite(value) for value in (m, b, factor)) or m >= 0 or b <= 0 or factor <= 0:
            raise ValueError("invalid calibration")
    base = float(settings.get("formula", {}).get("logBase", 10))
    if not math.isfinite(base) or base <= 1:
        raise ValueError("invalid logarithm base")


class AppHandler(BaseHTTPRequestHandler):
    server_version = "MicrobiotaVaginal/0.1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        if path == "/api/settings":
            with SETTINGS_LOCK:
                self.respond_json(load_settings())
            return
        if path in ("/", "/index.html"):
            self.respond_file(STATIC_DIR / "index.html")
            return
        if path.startswith("/static/"):
            self.respond_file(STATIC_DIR / path.removeprefix("/static/"))
            return
        if path.startswith("/assets/"):
            self.respond_file(ASSET_DIR / path.removeprefix("/assets/"))
            return
        self.send_error(404)

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path != "/api/settings":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if not isinstance(payload, dict):
                raise ValueError("invalid settings")
            validate_calibration(payload)
            with SETTINGS_LOCK:
                save_settings(payload)
            self.respond_json({"ok": True})
        except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
            self.respond_json({"ok": False, "error": "Configuración inválida"}, status=400)

    def respond_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_file(self, path: Path) -> None:
        path = path.resolve()
        roots = (STATIC_DIR.resolve(), ASSET_DIR.resolve())
        if not path.exists() or not path.is_file() or not any(str(path).startswith(str(root)) for root in roots):
            self.send_error(404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def available_port(start: int = 5063) -> int:
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main() -> None:
    port = int(os.environ.get("PORT") or available_port())
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), AppHandler)
    url = f"http://127.0.0.1:{port}/"
    print(url, flush=True)
    if os.environ.get("MICROBIOTA_NO_BROWSER") != "1":
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
