import sqlite3
import os
import shutil
import json
import urllib.request
import urllib.error
import logging
import httpx
from datetime import datetime
from typing import Generator, Any, List, Optional
from contextlib import contextmanager

logger = logging.getLogger("database")
logger.setLevel(logging.INFO)

# Turso Cloud SQLite credentials
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "").strip().strip("'\"")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "").strip().strip("'\"")

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(DB_DIR, "attendance.db")

# Local SQLite directory fallback
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    TMP_DIR = "/tmp/attendance_data"
    try:
        os.makedirs(TMP_DIR, exist_ok=True)
    except Exception:
        pass
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

try:
    os.makedirs(BACKUP_DIR, exist_ok=True)
except Exception:
    pass

# ---------------------------------------------------------------------------
# Turso Cloud SQLite HTTP Driver (High-Performance Keep-Alive Pooled)
# ---------------------------------------------------------------------------
# Global persistent httpx client for high-performance HTTP keep-alive connection pooling
_http_client: Optional[httpx.Client] = None

def get_http_client() -> httpx.Client:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.Client(timeout=10.0, limits=httpx.Limits(max_keepalive_connections=20, max_connections=50))
    return _http_client

class TursoRow(dict):
    """Dict-like wrapper for rows to support both dict['col'] and tuple[idx] access."""
    def __init__(self, cols: List[str], values: List[Any]):
        super().__init__(zip(cols, values))
        self._values = list(values)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

def _convert_param_to_turso_arg(p: Any) -> Dict[str, Any]:
    if p is None:
        return {"type": "null"}
    elif isinstance(p, int):
        return {"type": "integer", "value": str(p)}
    elif isinstance(p, float):
        return {"type": "float", "value": p}
    else:
        return {"type": "text", "value": str(p)}

class TursoCursor:
    def __init__(self, client: 'TursoConnection'):
        self.client = client
        self.lastrowid: Optional[int] = None
        self._rows: List[TursoRow] = []
        self._row_idx: int = 0

    def execute(self, sql: str, params: tuple = ()):
        args = [_convert_param_to_turso_arg(p) for p in params]

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

        try:
            http = get_http_client()
            response = http.post(endpoint, json=payload, headers=headers)
            if response.status_code != 200:
                raise RuntimeError(f"Turso HTTP Error {response.status_code}: {response.text}")
            
            data = response.json()
            results = data.get("results", [])
            if not results:
                return self
            
            first_res = results[0]
            if first_res.get("type") == "error":
                err_msg = first_res.get("error", {}).get("message", "Unknown SQL Error")
                raise RuntimeError(f"Turso SQL Error: {err_msg}")
            
            resp_data = first_res.get("response", {}).get("result", {})
            lid = resp_data.get("last_insert_rowid")
            if lid is not None:
                try:
                    self.lastrowid = int(lid)
                except (ValueError, TypeError):
                    self.lastrowid = None
            
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
        except Exception as e:
            logger.error(f"Error executing Turso SQL [{sql}]: {e}")
            raise

    def executemany(self, sql: str, seq_of_params: list):
        if not seq_of_params:
            return self

        requests = []
        for params in seq_of_params:
            args = [_convert_param_to_turso_arg(p) for p in params]
            requests.append({
                "type": "execute",
                "stmt": {
                    "sql": sql,
                    "args": args
                }
            })
        requests.append({"type": "close"})

        endpoint = self.client.pipeline_url
        headers = {
            "Authorization": f"Bearer {self.client.auth_token}",
            "Content-Type": "application/json"
        }
        payload = {"requests": requests}

        try:
            http = get_http_client()
            response = http.post(endpoint, json=payload, headers=headers)
            if response.status_code != 200:
                raise RuntimeError(f"Turso HTTP Error {response.status_code}: {response.text}")
            
            data = response.json()
            for res in data.get("results", []):
                if res.get("type") == "error":
                    err_msg = res.get("error", {}).get("message", "Unknown SQL Error")
                    raise RuntimeError(f"Turso Batch SQL Error: {err_msg}")
            
            self._rows = []
            self._row_idx = 0
            return self
        except Exception as e:
            logger.error(f"Error executing Turso executemany [{sql}]: {e}")
            raise

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

    def executemany(self, sql: str, seq_of_params: list):
        cur = self.cursor()
        return cur.executemany(sql, seq_of_params)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

# ---------------------------------------------------------------------------
# Database Connection Manager
# ---------------------------------------------------------------------------
def is_turso_configured() -> bool:
    return bool(TURSO_DATABASE_URL and TURSO_AUTH_TOKEN and len(TURSO_AUTH_TOKEN) > 20)

def get_db_connection():
    if is_turso_configured():
        return TursoConnection(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
    else:
        conn = sqlite3.connect(DB_PATH, timeout=20.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
        except Exception:
            pass
        return conn

@contextmanager
def get_db() -> Generator[Any, None, None]:
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
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
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocks_sec ON timetable_blocks(section_id);")

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
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_user_block ON daily_logs(user_id, block_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_block ON daily_logs(block_id);")

            # Notification preferences table (Additive)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);")

            # Notification subscriptions table (Additive)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                endpoint TEXT UNIQUE NOT NULL,
                keys_p256dh TEXT NOT NULL,
                keys_auth TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notif_sub_user ON notification_subscriptions(user_id);")

            # Notification times table (Additive)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_times (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                time_of_day TEXT NOT NULL,
                label TEXT,
                is_prebuilt BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, time_of_day),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notif_times_user ON notification_times(user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_notif_times_lookup ON notification_times(time_of_day);")
    except Exception as e:
        print("Init DB notice:", e)

def backup_db() -> str:
    """Creates a timestamped snapshot backup of the SQLite database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"attendance_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    if not is_turso_configured():
        conn = sqlite3.connect(DB_PATH)
        dst_conn = sqlite3.connect(backup_path)
        try:
            conn.backup(dst_conn)
        finally:
            dst_conn.close()
            conn.close()
    return backup_path
