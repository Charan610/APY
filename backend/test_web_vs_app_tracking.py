import sys
import os
import unittest
import time
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import app
from database import get_db, init_db

class TestWebVsAppTracking(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)
        cls.test_reg = f"PLAT_{int(time.time())}"
        cls.test_pin = "4321"

    def test_01_web_registration(self):
        """1. Register via Web -> Check login_sessions row created with platform = 'web'"""
        res = self.client.post(
            "/api/auth/register",
            json={
                "register_number": self.test_reg,
                "pin": self.test_pin,
                "section_id": 3,
                "platform": "web"
            },
            headers={"X-Client-Platform": "web"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("token", data)
        user_id = data["user"]["id"]

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT user_id, platform, token_hash, created_at, last_seen_at FROM login_sessions WHERE user_id = ?", (user_id,))
            sessions = [dict(r) for r in cur.fetchall()]
            print("\n[Test 1] Web Registration Sessions in DB:", sessions)
            self.assertTrue(len(sessions) >= 1)
            self.assertEqual(sessions[0]["platform"], "web")

    def test_02_android_login(self):
        """2. Log in from Android App -> Check second session row created with platform = 'android'"""
        res = self.client.post(
            "/api/auth/login",
            json={
                "register_number": self.test_reg,
                "pin": self.test_pin,
                "platform": "android"
            },
            headers={"X-Client-Platform": "android"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        token = data["token"]
        user_id = data["user"]["id"]

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT user_id, platform, token_hash, created_at, last_seen_at FROM login_sessions WHERE user_id = ? ORDER BY id ASC", (user_id,))
            sessions = [dict(r) for r in cur.fetchall()]
            print("\n[Test 2] Dual Sessions in DB (Web + Android):", sessions)
            platforms = [s["platform"] for s in sessions]
            self.assertIn("web", platforms)
            self.assertIn("android", platforms)

    def test_03_shared_attendance_integrity(self):
        """3. Web and Android clients write and read the exact same attendance logs"""
        # A. Login on Web
        web_res = self.client.post("/api/auth/login", json={"register_number": self.test_reg, "pin": self.test_pin, "platform": "web"})
        web_token = web_res.json()["token"]

        # B. Login on Android
        app_res = self.client.post("/api/auth/login", json={"register_number": self.test_reg, "pin": self.test_pin, "platform": "android"})
        app_token = app_res.json()["token"]

        # Get timetable to find a valid block_id for section 3
        tt_res = self.client.get("/api/sections/3/timetable", headers={"Authorization": f"Bearer {web_token}"})
        self.assertEqual(tt_res.status_code, 200)
        tt_blocks = tt_res.json().get("blocks") or tt_res.json().get("timetable") or []
        self.assertTrue(len(tt_blocks) > 0)
        first_block = tt_blocks[0]
        block_id = first_block["id"]

        # Mark attendance from Web
        today = time.strftime("%Y-%m-%d")
        mark_res = self.client.post(
            "/api/attendance/mark",
            json={"log_date": today, "entries": [{"block_id": block_id, "status": "present"}]},
            headers={"Authorization": f"Bearer {web_token}", "X-Client-Platform": "web"}
        )
        self.assertEqual(mark_res.status_code, 200)

        # Read attendance from Android
        logs_res = self.client.get(
            f"/api/attendance/logs?start_date={today}&end_date={today}",
            headers={"Authorization": f"Bearer {app_token}", "X-Client-Platform": "android"}
        )
        self.assertEqual(logs_res.status_code, 200)
        logs = logs_res.json()["logs"]
        print("\n[Test 3] Android Client reading attendance logged from Web:", logs)
        self.assertTrue(len(logs) > 0)
        self.assertEqual(logs[0]["status"], "present")

    def test_04_admin_platform_tracking(self):
        """4. Admin search shows student platform adoption badges"""
        # Admin login
        admin_login = self.client.post("/api/auth/login", json={"register_number": "23B91A05C0", "pin": "1234"})
        if admin_login.status_code == 200:
            admin_token = admin_login.json()["token"]
            search_res = self.client.get(
                f"/api/admin/search?register_number={self.test_reg}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            self.assertEqual(search_res.status_code, 200)
            result = search_res.json()
            print("\n[Test 4] Admin Search Result with Platforms:", result["exact_match"]["platforms"])
            self.assertIn("web", result["exact_match"]["platforms"])
            self.assertIn("android", result["exact_match"]["platforms"])

if __name__ == "__main__":
    unittest.main()
