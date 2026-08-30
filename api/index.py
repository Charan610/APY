import os
import sys
import json
import traceback

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

for p in [BACKEND_DIR, CURRENT_DIR, ROOT_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from main import app as fastapi_app
    app = fastapi_app
    handler = fastapi_app
except Exception as e:
    err_tb = traceback.format_exc()
    print("FATAL VERCEL IMPORT ERROR:\n", err_tb)
    
    from http.server import BaseHTTPRequestHandler
    class ErrorDiagnosticHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = json.dumps({"error": "Vercel Python import failed", "traceback": err_tb})
            self.wfile.write(resp.encode("utf-8"))
            
        def do_POST(self):
            self.do_GET()
            
    app = ErrorDiagnosticHandler
    handler = ErrorDiagnosticHandler
