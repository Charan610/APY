import os

# Never touch production attendance.db: run in serverless mode so main.py skips
# scheduler startup, schema init, and seeding, and redirects DB_PATH to /tmp.
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("TURSO_DATABASE_URL", "")
os.environ.setdefault("TURSO_AUTH_TOKEN", "")

import main


def test_app_imports_and_starts():
    assert main.app is not None
    assert main.app.title == "ATT PER Y API"
    assert main.app.version == "1.0.0"


def test_routes_registered():
    # Smoke check: app has routes mounted (include routers)
    assert len(main.app.routes) > 0
    route_names = [getattr(r, "path", getattr(r, "name", "")) for r in main.app.routes]
    assert any(isinstance(x, str) for x in route_names)
