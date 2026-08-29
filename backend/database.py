import sqlite3
import os
import shutil
from datetime import datetime
from typing import Generator
from contextlib import contextmanager

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "attendance.db")
BACKUP_DIR = os.path.join(DB_DIR, "backups")

os.makedirs(BACKUP_DIR, exist_ok=True)

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
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
            weekday INTEGER NOT NULL, -- 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
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
            log_date TEXT NOT NULL, -- YYYY-MM-DD
            block_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'holiday')),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, log_date, block_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (block_id) REFERENCES timetable_blocks(id) ON DELETE CASCADE
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_user_date ON daily_logs(user_id, log_date);")

def backup_db() -> str:
    """Creates a timestamped snapshot backup of the SQLite database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"attendance_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    # Use SQLite's online backup API for consistency
    src_conn = get_db_connection()
    dst_conn = sqlite3.connect(backup_path)
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
        
    return backup_path
