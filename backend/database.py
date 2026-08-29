import sqlite3
import os
import shutil
import httpx
import traceback
from datetime import datetime
from typing import Generator, Any, List, Optional
from contextlib import contextmanager

# Turso Cloud SQLite credentials
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "").strip().strip("'\"")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "").strip().strip("'\"")

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(DB_DIR, "attendance.db")

# Local SQLite directory fallback
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    TMP_DIR = "/tmp/attendance_data"
    os.makedirs(TMP_DIR, exist_ok=True)
    DB_PATH = os.path.join(TMP_DIR, "attendance.db")
    BACKUP_DIR = os.path.join(TMP_DIR, "backups")
    if not os.path.exists(DB_PATH) and os.path.exists(DEFAULT_DB_PATH):
        try:
            shutil.copy2(DEFAULT_DB_PATH, DB_PATH)
        except Exception as e:
            print("DB copy notice:", e)
else:
    DB_PATH = DEFAULT_DB_PATH
    BACKUP_DIR = os.path.join(DB_DIR, "backups")

os.makedirs(BACKUP_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Turso Cloud SQLite HTTP Pipeline Adapter
# ---------------------------------------------------------------------------
class TursoRow(dict):
    def __init__(self, cols: List[str], values: List[Any]):
        super().__init__(zip(cols, values))
        self._values = list(values)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

class TursoCursor:
    def __init__(self, client: 'TursoConnection'):
        self.client = client
        self.lastrowid: Optional[int] = None
        self._rows: List[TursoRow] = []
        self._row_idx: int = 0

    def execute(self, sql: str, params: tuple = ()):
        # Normalize params for Turso JSON pipeline
        args = []
        for p in params:
            if p is None:
                args.append({"type": "null"})
            elif isinstance(p, int):
                args.append({"type": "integer", "value": str(p)})
            elif isinstance(p, float):
                args.append({"type": "float", "value": p})
            else:
                args.append({"type": "text", "value": str(p)})

        endpoint = self.client.pipeline_url
        headers = {
            "Authorization": f"Bearer {self.client.auth_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "requests": [
                {
                    "type": "execute",
                    "stmt": {
                        "sql": sql,
                        "args": args
                    }
                },
                {"type": "close"}
            ]
        }

        with httpx.Client(timeout=10.0) as http_client:
            res = http_client.post(endpoint, json=payload, headers=headers)
            if res.status_code != 200:
                raise RuntimeError(f"Turso query failed (HTTP {res.status_code}): {res.text}")
            
            data = res.json()
            results = data.get("results", [])
            if not results:
                return self
            
            first_res = results[0]
            if first_res.get("type") == "error":
                err_msg = first_res.get("error", {}).get("message", "Unknown SQL Error")
                raise RuntimeError(f"Turso SQL Error: {err_msg}")
            
            resp_data = first_res.get("response", {}).get("result", {})
            self.lastrowid = resp_data.get("last_insert_rowid")
            
            cols = [c.get("name") for c in resp_data.get("cols", [])]
            raw_rows = resp_data.get("rows", [])
            
            parsed_rows = []
            for r in raw_rows:
                vals = []
                for cell in r:
                    c_type = cell.get("type")
                    val = cell.get("value")
                    if c_type == "integer" and val is not None:
                        vals.append(int(val))
                    elif c_type == "float" and val is not None:
                        vals.append(float(val))
                    elif c_type == "null":
                        vals.append(None)
                    else:
                        vals.append(val)
                parsed_rows.append(TursoRow(cols, vals))
                
            self._rows = parsed_rows
            self._row_idx = 0
            return self

    def fetchone(self) -> Optional[TursoRow]:
        if self._row_idx < len(self._rows):
            row = self._rows[self._row_idx]
            self._row_idx += 1
            return row
        return None

    def fetchall(self) -> List[TursoRow]:
        remaining = self._rows[self._row_idx:]
        self._row_idx = len(self._rows)
        return remaining

class TursoConnection:
    def __init__(self, db_url: str, auth_token: str):
        url = db_url.strip()
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        elif not url.startswith("http://") and not url.startswith("https://"):
            url = "https://" + url
            
        if not url.endswith("/v2/pipeline"):
            url = url.rstrip("/") + "/v2/pipeline"
            
        self.pipeline_url = url
        self.auth_token = auth_token.strip()

    def cursor(self) -> TursoCursor:
        return TursoCursor(self)

    def execute(self, sql: str, params: tuple = ()):
        cur = self.cursor()
        return cur.execute(sql, params)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

# ---------------------------------------------------------------------------
# Resilient Database Connection Manager (with Auto-Fallback)
# ---------------------------------------------------------------------------
_USE_FALLBACK_SQLITE = False

def get_local_sqlite_connection():
    conn = sqlite3.connect(DB_PATH, timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
    except Exception:
        pass
    return conn

def is_turso_configured() -> bool:
    global _USE_FALLBACK_SQLITE
    if _USE_FALLBACK_SQLITE:
        return False
    return bool(TURSO_DATABASE_URL and TURSO_AUTH_TOKEN and len(TURSO_AUTH_TOKEN) > 20)

def get_db_connection():
    global _USE_FALLBACK_SQLITE
    if is_turso_configured():
        try:
            return TursoConnection(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
        except Exception as e:
            print("Turso init failed, falling back to local SQLite:", e)
            _USE_FALLBACK_SQLITE = True
            return get_local_sqlite_connection()
    else:
        return get_local_sqlite_connection()

@contextmanager
def get_db() -> Generator[Any, None, None]:
    global _USE_FALLBACK_SQLITE
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        # If Turso query failed due to connection/token, fallback to local SQLite
        if isinstance(conn, TursoConnection):
            print("Turso operation error, falling back to local SQLite:", e)
            _USE_FALLBACK_SQLITE = True
            # Retry operation with local SQLite
            with get_db() as fallback_conn:
                yield fallback_conn
                return
        raise
    finally:
        conn.close()

def init_db():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Sections table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch TEXT NOT NULL,
                section_label TEXT NOT NULL,
                effective_from TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(branch, section_label)
            );
            """)

            # Users table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                register_number TEXT UNIQUE NOT NULL,
                pin_hash TEXT NOT NULL,
                section_id INTEGER NOT NULL,
                baseline_attended INTEGER DEFAULT 0,
                baseline_total INTEGER DEFAULT 0,
                baseline_date TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_reg_no ON users(register_number);")

            # Timetable blocks table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS timetable_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                section_id INTEGER NOT NULL,
                weekday INTEGER NOT NULL,
                order_index INTEGER NOT NULL,
                subject TEXT NOT NULL,
                periods INTEGER NOT NULL,
                FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocks_sec_day ON timetable_blocks(section_id, weekday);")

            # Daily logs table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                log_date TEXT NOT NULL,
                block_id INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'holiday')),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, log_date, block_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (block_id) REFERENCES timetable_blocks(id) ON DELETE CASCADE
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_user_date ON daily_logs(user_id, log_date);")
    except Exception as e:
        print("Init DB notice:", e)

def backup_db() -> str:
    """Creates a timestamped snapshot backup of the SQLite database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"attendance_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    if not is_turso_configured():
        src_conn = get_local_sqlite_connection()
        dst_conn = sqlite3.connect(backup_path)
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
            src_conn.close()
    return backup_path
