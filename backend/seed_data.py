from database import get_db, init_db
import bcrypt

# Weekday constants: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

SECTIONS_DATA = [
    {
        "branch": "CSE",
        "section_label": "A",
        "effective_from": "2026-07-20",
        "blocks": [
            # Mon
            {"weekday": 1, "order_index": 1, "subject": "DBMS LAB", "periods": 4},
            {"weekday": 1, "order_index": 2, "subject": "DMGT", "periods": 2},
            # Tue
            {"weekday": 2, "order_index": 1, "subject": "OOPJ", "periods": 2},
            {"weekday": 2, "order_index": 2, "subject": "DLCO", "periods": 2},
            {"weekday": 2, "order_index": 3, "subject": "PP LAB", "periods": 4},
            # Wed
            {"weekday": 3, "order_index": 1, "subject": "UHV-2", "periods": 2},
            {"weekday": 3, "order_index": 2, "subject": "OOPJ", "periods": 2},
            {"weekday": 3, "order_index": 3, "subject": "OOPJ LAB", "periods": 4},
            # Thu
            {"weekday": 4, "order_index": 1, "subject": "DLCO", "periods": 2},
            {"weekday": 4, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 4, "order_index": 3, "subject": "UHV-2", "periods": 2},
            # Fri
            {"weekday": 5, "order_index": 1, "subject": "DMGT", "periods": 2},
            {"weekday": 5, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 5, "order_index": 3, "subject": "ES", "periods": 2},
            # Sat: no classes
        ]
    },
    {
        "branch": "CSE",
        "section_label": "B",
        "effective_from": "2026-07-20",
        "blocks": [
            # Mon
            {"weekday": 1, "order_index": 1, "subject": "DMGT", "periods": 2},
            {"weekday": 1, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 1, "order_index": 3, "subject": "ES", "periods": 2},
            # Tue
            {"weekday": 2, "order_index": 1, "subject": "UHV-2", "periods": 2},
            {"weekday": 2, "order_index": 2, "subject": "DLCO", "periods": 2},
            {"weekday": 2, "order_index": 3, "subject": "DBMS LAB", "periods": 4},
            # Wed
            {"weekday": 3, "order_index": 1, "subject": "PP LAB", "periods": 4},
            {"weekday": 3, "order_index": 2, "subject": "OOPJ", "periods": 2},
            # Thu
            {"weekday": 4, "order_index": 1, "subject": "OOPJ", "periods": 2},
            {"weekday": 4, "order_index": 2, "subject": "DMGT", "periods": 2},
            # Fri
            {"weekday": 5, "order_index": 1, "subject": "DLCO", "periods": 2},
            {"weekday": 5, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 5, "order_index": 3, "subject": "UHV-2", "periods": 2},
            # Sat
            {"weekday": 6, "order_index": 1, "subject": "OOPJ LAB", "periods": 4},
        ]
    },
    {
        "branch": "CSE",
        "section_label": "C",
        "effective_from": "2026-07-20",
        "blocks": [
            # Mon
            {"weekday": 1, "order_index": 1, "subject": "UHV-2", "periods": 2},
            {"weekday": 1, "order_index": 2, "subject": "DMGT", "periods": 2},
            # Tue
            {"weekday": 2, "order_index": 1, "subject": "OOPJ", "periods": 2},
            {"weekday": 2, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 2, "order_index": 3, "subject": "PP LAB", "periods": 4},
            # Wed
            {"weekday": 3, "order_index": 1, "subject": "DBMS LAB", "periods": 4},
            {"weekday": 3, "order_index": 2, "subject": "DLCO", "periods": 2},
            # Thu
            {"weekday": 4, "order_index": 1, "subject": "OOPJ", "periods": 2},
            {"weekday": 4, "order_index": 2, "subject": "DLCO", "periods": 2},
            {"weekday": 4, "order_index": 3, "subject": "OOPJ LAB", "periods": 4},
            # Fri
            {"weekday": 5, "order_index": 1, "subject": "UHV-2", "periods": 2},
            {"weekday": 5, "order_index": 2, "subject": "DMGT", "periods": 2},
            # Sat
            {"weekday": 6, "order_index": 1, "subject": "DBMS", "periods": 2},
            {"weekday": 6, "order_index": 2, "subject": "ES", "periods": 2},
        ]
    },
    {
        "branch": "CSE",
        "section_label": "D",
        "effective_from": "2026-07-20",
        "blocks": [
            # Mon
            {"weekday": 1, "order_index": 1, "subject": "DMGT", "periods": 2},
            {"weekday": 1, "order_index": 2, "subject": "DLCO", "periods": 2},
            {"weekday": 1, "order_index": 3, "subject": "UHV-2", "periods": 2},
            # Tue
            {"weekday": 2, "order_index": 1, "subject": "UHV-2", "periods": 2},
            {"weekday": 2, "order_index": 2, "subject": "OOPJ", "periods": 2},
            {"weekday": 2, "order_index": 3, "subject": "DMGT", "periods": 2},
            # Wed
            {"weekday": 3, "order_index": 1, "subject": "PP LAB", "periods": 4},
            {"weekday": 3, "order_index": 2, "subject": "DBMS", "periods": 2},
            # Thu
            {"weekday": 4, "order_index": 1, "subject": "ES", "periods": 2},
            {"weekday": 4, "order_index": 2, "subject": "OOPJ", "periods": 2},
            {"weekday": 4, "order_index": 3, "subject": "DBMS LAB", "periods": 4},
            # Fri
            {"weekday": 5, "order_index": 1, "subject": "DLCO", "periods": 2},
            {"weekday": 5, "order_index": 2, "subject": "DBMS", "periods": 2},
            {"weekday": 5, "order_index": 3, "subject": "OOPJ LAB", "periods": 4},
            # Sat: no classes
        ]
    },
    {
        "branch": "CSE",
        "section_label": "E",
        "effective_from": "2026-07-20",
        "blocks": [
            # Mon
            {"weekday": 1, "order_index": 1, "subject": "DMGT", "periods": 2},
            {"weekday": 1, "order_index": 2, "subject": "DBMS", "periods": 2},
            # Tue
            {"weekday": 2, "order_index": 1, "subject": "OOPJ LAB", "periods": 4},
            {"weekday": 2, "order_index": 2, "subject": "UHV-2", "periods": 2},
            # Wed
            {"weekday": 3, "order_index": 1, "subject": "DLCO", "periods": 2},
            {"weekday": 3, "order_index": 2, "subject": "OOPJ", "periods": 2},
            {"weekday": 3, "order_index": 3, "subject": "DBMS", "periods": 2},
            # Thu
            {"weekday": 4, "order_index": 1, "subject": "PP LAB", "periods": 4},
            {"weekday": 4, "order_index": 2, "subject": "OOPJ", "periods": 2},
            # Fri
            {"weekday": 5, "order_index": 1, "subject": "ES", "periods": 2},
            {"weekday": 5, "order_index": 2, "subject": "UHV-2", "periods": 2},
            {"weekday": 5, "order_index": 3, "subject": "DBMS LAB", "periods": 4},
            # Sat
            {"weekday": 6, "order_index": 1, "subject": "DMGT", "periods": 2},
            {"weekday": 6, "order_index": 2, "subject": "DLCO", "periods": 2},
        ]
    }
]

def seed_database():
    init_db()
    with get_db() as conn:
        cursor = conn.cursor()
        
        for sec in SECTIONS_DATA:
            cursor.execute(
                "SELECT id FROM sections WHERE branch = ? AND section_label = ?",
                (sec["branch"], sec["section_label"])
            )
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "INSERT INTO sections (branch, section_label, effective_from) VALUES (?, ?, ?)",
                    (sec["branch"], sec["section_label"], sec["effective_from"])
                )
                section_id = cursor.lastrowid
                print(f"Seeded section {sec['branch']} - {sec['section_label']} (ID: {section_id})")
            else:
                section_id = row["id"]

            # Insert blocks if none exist
            cursor.execute("SELECT COUNT(*) as count FROM timetable_blocks WHERE section_id = ?", (section_id,))
            block_count = cursor.fetchone()["count"]
            if block_count == 0:
                for block in sec["blocks"]:
                    cursor.execute(
                        """
                        INSERT INTO timetable_blocks (section_id, weekday, order_index, subject, periods)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (section_id, block["weekday"], block["order_index"], block["subject"], block["periods"])
                    )
                print(f"Seeded {len(sec['blocks'])} timetable blocks for section {sec['section_label']}")

        # Seed original tester user for Section C (spec §9)
        cursor.execute("SELECT id FROM sections WHERE branch = 'CSE' AND section_label = 'C'")
        sec_c = cursor.fetchone()
        if sec_c:
            sec_c_id = sec_c["id"]
            test_reg = "23B91A05C0"
            cursor.execute("SELECT id FROM users WHERE register_number = ?", (test_reg,))
            if not cursor.fetchone():
                pin_salt = bcrypt.gensalt()
                pin_hash = bcrypt.hashpw("1234".encode('utf-8'), pin_salt).decode('utf-8')
                cursor.execute(
                    """
                    INSERT INTO users (register_number, pin_hash, section_id, baseline_attended, baseline_total, baseline_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (test_reg, pin_hash, sec_c_id, 193, 262, "2026-08-24")
                )
                print(f"Seeded tester user {test_reg} (PIN: 1234) for Section C with baseline 193/262 (2026-08-24)")

if __name__ == "__main__":
    seed_database()
