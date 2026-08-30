from http.server import BaseHTTPRequestHandler
import json
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "ok",
            "turso_configured": bool(os.environ.get("TURSO_DATABASE_URL") and os.environ.get("TURSO_AUTH_TOKEN"))
        }).encode("utf-8"))
