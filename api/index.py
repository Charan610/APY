import os
import sys
import json
import traceback

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_LOCAL = os.path.join(CURRENT_DIR, "backend")
BACKEND_PARENT = os.path.join(os.path.dirname(CURRENT_DIR), "backend")

for p in [BACKEND_LOCAL, BACKEND_PARENT, CURRENT_DIR]:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

try:
    from main import app as fastapi_app
    import_err = None
except Exception as e:
    fastapi_app = None
    import_err = traceback.format_exc()

async def app(scope, receive, send):
    if scope["type"] == "lifespan":
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return

    if fastapi_app is None:
        body = json.dumps({"error": "Import error on Vercel", "traceback": import_err}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode("utf-8")]
            ]
        })
        await send({"type": "http.response.body", "body": body})
        return

    try:
        await fastapi_app(scope, receive, send)
    except Exception as exc:
        err_tb = traceback.format_exc()
        body = json.dumps({"error": "FastAPI runtime error on Vercel", "traceback": err_tb}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode("utf-8")]
            ]
        })
        await send({"type": "http.response.body", "body": body})
