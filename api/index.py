import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from main import app as fastapi_app

async def app(scope, receive, send):
    if scope["type"] == "http":
        path = scope.get("path", "")
        if path.startswith("/api/index.py"):
            scope["path"] = path[len("/api/index.py"):] or "/"
        elif path.startswith("/index.py"):
            scope["path"] = path[len("/index.py"):] or "/"
            
    await fastapi_app(scope, receive, send)
