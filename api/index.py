import os
import sys
import io
import asyncio

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from main import app as fastapi_app

class VercelUniversalBridge:
    """
    Universal bridge that works whether Vercel invokes it as:
    1. ASGI app(scope, receive, send)
    2. WSGI handler(environ, start_response)
    """
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    def __call__(self, *args, **kwargs):
        if len(args) == 2:
            return self.handle_wsgi(args[0], args[1])
        return self.asgi_app(*args, **kwargs)

    def handle_wsgi(self, environ, start_response):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        path = environ.get("PATH_INFO", "")
        if path.startswith("/api/index.py"):
            path = path[len("/api/index.py"):] or "/"
        elif path.startswith("/index.py"):
            path = path[len("/index.py"):] or "/"

        headers = []
        for key, value in environ.items():
            if key.startswith("HTTP_"):
                header_name = key[5:].replace("_", "-").lower().encode("utf-8")
                headers.append([header_name, str(value).encode("utf-8")])
            elif key in ("CONTENT_TYPE", "CONTENT_LENGTH") and value:
                header_name = key.replace("_", "-").lower().encode("utf-8")
                headers.append([header_name, str(value).encode("utf-8")])

        body_content = b""
        try:
            content_length = int(environ.get("CONTENT_LENGTH", 0) or 0)
            if content_length > 0:
                body_content = environ["wsgi.input"].read(content_length)
        except Exception:
            pass

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": environ.get("REQUEST_METHOD", "GET"),
            "scheme": environ.get("wsgi.url_scheme", "https"),
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": environ.get("QUERY_STRING", "").encode("utf-8"),
            "headers": headers,
            "server": (environ.get("SERVER_NAME", "localhost"), int(environ.get("SERVER_PORT", 443))),
        }

        response_status = 200
        response_headers = []
        response_body = io.BytesIO()

        async def receive():
            return {"type": "http.request", "body": body_content, "more_body": False}

        async def send(message):
            nonlocal response_status, response_headers
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = [
                    (h[0].decode("utf-8"), h[1].decode("utf-8")) for h in message.get("headers", [])
                ]
            elif message["type"] == "http.response.body":
                response_body.write(message.get("body", b""))

        try:
            loop.run_until_complete(self.asgi_app(scope, receive, send))
        finally:
            loop.close()

        status_text = {
            200: "200 OK",
            201: "201 Created",
            400: "400 Bad Request",
            401: "401 Unauthorized",
            404: "404 Not Found",
            422: "422 Unprocessable Entity",
            500: "500 Internal Server Error"
        }.get(response_status, f"{response_status} Status")

        start_response(status_text, response_headers)
        return [response_body.getvalue()]

bridge = VercelUniversalBridge(fastapi_app)
app = bridge
handler = bridge
