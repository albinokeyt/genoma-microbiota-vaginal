"""Local-only PDF capture harness; run with python tests/pdf_preview_server.py."""

import importlib.util
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "qa" / "pdf"
os.environ["DATA_DIR"] = str(ROOT / "qa" / "data")
spec = importlib.util.spec_from_file_location("panel_app", ROOT / "app" / "app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class PdfPreviewHandler(app.AppHandler):
    def do_GET(self):
        if self.path == "/":
            html = (app.STATIC_DIR / "index.html").read_text(encoding="utf-8")
            html = html.replace(
                '<script src="/static/app.js"></script>',
                '<script src="/qa-probe.js"></script><script src="/static/app.js"></script>',
            )
            self.send_bytes(html.encode(), "text/html; charset=utf-8")
        elif self.path == "/qa-probe.js":
            self.send_bytes(Path(__file__).with_name("pdf_probe.js").read_bytes(), "text/javascript")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/qa/pdf":
            return super().do_POST()
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 20_000_000:
            return self.send_error(400)
        content = self.rfile.read(length)
        if not content.startswith(b"%PDF-"):
            return self.send_error(400)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        index = len(list(OUTPUT.glob("report-*.pdf"))) + 1
        path = OUTPUT / f"report-{index}.pdf"
        path.write_bytes(content)
        self.respond_json({"file": path.name, "bytes": len(content)})

    def send_bytes(self, content, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    port = app.available_port(5080)
    server = app.ThreadingHTTPServer(("127.0.0.1", port), PdfPreviewHandler)
    print(f"PDF test server: http://127.0.0.1:{port}/", flush=True)
    server.serve_forever()
