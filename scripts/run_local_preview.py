"""Run the API with isolated demo data for reviewing local UI changes.

Usage: backend/venv/bin/python scripts/run_local_preview.py
Then run `npm run dev -- --host 127.0.0.1` inside frontend/.
"""
import os
from pathlib import Path
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    # Suppress reminders, production initialization and cloud DB access.
    os.environ["VERCEL"] = "1"
    os.environ["TURSO_DATABASE_URL"] = ""
    os.environ["TURSO_AUTH_TOKEN"] = ""
    os.environ["JWT_SECRET_KEY"] = "apy-isolated-local-preview-only"
    sys.path.insert(0, str(root / "backend"))

    import database
    database.DB_PATH = str(root / "backend" / "local-preview.db")
    database._local_schema_initialized = True
    database.init_db()

    from seed_data import seed_database
    from auth import hash_pin
    seed_database()
    with database.get_db() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO users
                (register_number, pin_hash, section_id, baseline_attended, baseline_total, baseline_date)
            VALUES (?, ?, (SELECT id FROM sections WHERE branch = 'CSE' AND section_label = 'C'), 193, 262, '2026-08-24')
        """, ("LOCALREVIEW", hash_pin("1234")))

    from main import app
    import uvicorn
    print("Isolated local preview — register number LOCALREVIEW, PIN 1234", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
