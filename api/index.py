import os
import sys
import traceback

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)

for p in [CURRENT_DIR, os.path.join(CURRENT_DIR, "_backend"), os.path.join(ROOT_DIR, "backend"), ROOT_DIR]:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

import_error = None
try:
    from main import app as fastapi_app
    from mangum import Mangum
    fastapi_handler = Mangum(fastapi_app, lifespan="off")
except Exception as e:
    import_error = traceback.format_exc()
    fastapi_app = None
    fastapi_handler = None

async def app(scope, receive, send):
    if import_error:
        response_body = f"IMPORT ERROR TRACEBACK:\n\n{import_error}".encode("utf-8")
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': [
                [b'content-type', b'text/plain; charset=utf-8'],
                [b'content-length', str(len(response_body)).encode('utf-8')]
            ]
        })
        await send({
            'type': 'http.response.body',
            'body': response_body,
        })
        return

    try:
        await fastapi_app(scope, receive, send)
    except Exception as e:
        err_tb = traceback.format_exc()
        response_body = f"RUNTIME ERROR TRACEBACK:\n\n{err_tb}".encode("utf-8")
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': [
                [b'content-type', b'text/plain; charset=utf-8'],
                [b'content-length', str(len(response_body)).encode('utf-8')]
            ]
        })
        await send({
            'type': 'http.response.body',
            'body': response_body,
        })

def handler(event, context):
    if import_error:
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/plain"},
            "body": f"IMPORT ERROR TRACEBACK (handler):\n\n{import_error}"
        }
    try:
        if fastapi_handler:
            return fastapi_handler(event, context)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/plain"},
            "body": "FastAPI handler not initialized"
        }
    except Exception as e:
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/plain"},
            "body": f"RUNTIME HANDLER ERROR:\n\n{traceback.format_exc()}"
        }
