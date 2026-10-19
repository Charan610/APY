import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import get_db

def view_registered_users():
    print("=" * 70)
    turso_url = os.environ.get("TURSO_DATABASE_URL", "").strip()
    if turso_url:
        print(f"Connecting to Database: Turso Cloud ({turso_url})")
    else:
        print("Connecting to Database: Local SQLite (backend/attendance.db)")
    print("=" * 70)

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute('''
            SELECT 
                u.id, 
                u.register_number, 
                COALESCE(s.branch, 'CSE') as branch, 
                COALESCE(s.section_label, '?') as section,
                u.baseline_attended, 
                u.baseline_total, 
                u.baseline_date,
                COUNT(d.id) as logged_periods,
                u.created_at
            FROM users u
            LEFT JOIN sections s ON u.section_id = s.id
            LEFT JOIN daily_logs d ON u.id = d.user_id
            GROUP BY u.id
            ORDER BY u.id ASC
        ''')
        rows = cursor.fetchall()
        
        if not rows:
            print("No users registered yet.")
            return

        print(f"\nTotal Registered Users: {len(rows)}\n")
        print(f"{'ID':<4} | {'Register No':<16} | {'Section':<8} | {'Baseline (Att/Tot)':<20} | {'Logged':<8} | {'Created At'}")
        print("-" * 80)
        for r in rows:
            baseline = f"{r['baseline_attended']}/{r['baseline_total']} ({r['baseline_date'] or 'None'})"
            section = f"{r['branch']}-{r['section']}"
            print(f"{r['id']:<4} | {r['register_number']:<16} | {section:<8} | {baseline:<20} | {r['logged_periods']:<8} | {r['created_at']}")
        print("-" * 80)

if __name__ == "__main__":
    view_registered_users()
