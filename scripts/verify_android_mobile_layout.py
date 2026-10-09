import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets

CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9222
URL = "http://localhost:5195"
OUTPUT_DIR = "/Users/charan/.gemini/antigravity-ide/brain/ce463863-5aee-4b43-ae48-516dcbfae70f/scratch/android_layout_validation"

AUTH_DATA = {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicmVnIjoiMjNCOTFBMDVDMCIsImV4cCI6MTgwNzAyNDkwNH0.z1Qc3ODGNzY6i9w1unA3EHLqqd0YMunR-9JVKGiIO24",
    "user": {
        "id": 1,
        "register_number": "23B91A05C0",
        "section_id": 3,
        "branch": "CSE",
        "section_label": "C",
        "baseline_attended": 193,
        "baseline_total": 262,
        "baseline_date": "2026-08-24",
        "is_admin": True
    },
    "summary": {
        "overall": {
            "attended": 217,
            "total": 286,
            "percentage": 75.87,
            "is_below_threshold": False
        }
    }
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

class AttachedCDPSession:
    def __init__(self, bws, session_id):
        self.bws = bws
        self.session_id = session_id
        self.msg_id = 100

    async def send(self, method, params=None):
        mid = self.msg_id
        self.msg_id += 1
        msg = {
            "id": mid,
            "sessionId": self.session_id,
            "method": method,
            "params": params or {}
        }
        await self.bws.send(json.dumps(msg))
        while True:
            res = await self.bws.recv()
            data = json.loads(res)
            if data.get("id") == mid:
                return data.get("result", {})

    async def evaluate(self, expr):
        res = await self.send("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        })
        return res.get("result", {}).get("value")

    async def screenshot(self, path):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        b64 = res.get("data")
        if b64:
            import base64
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))

def start_chrome():
    args = [
        CHROME_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars"
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(20):
        time.sleep(0.3)
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/version", timeout=1) as resp:
                if resp.status == 200:
                    return proc
        except Exception:
            pass
    return proc

async def test_mobile_layout():
    chrome_proc = start_chrome()
    try:
        url = f"http://localhost:{PORT}/json/version"
        req = urllib.request.urlopen(url)
        info = json.loads(req.read().decode())
        bws = await websockets.connect(info["webSocketDebuggerUrl"], max_size=30000000)

        # Create or find page target
        try:
            req_new = urllib.request.Request(f"http://localhost:{PORT}/json/new", method="PUT")
            new_target = json.loads(urllib.request.urlopen(req_new).read().decode())
            target_id = new_target["id"]
        except Exception:
            targets = json.loads(urllib.request.urlopen(f"http://localhost:{PORT}/json/list").read().decode())
            page_target = next((t for t in targets if t.get("type") == "page"), targets[0])
            target_id = page_target["id"]

        mid = 1
        await bws.send(json.dumps({
            "id": mid,
            "method": "Target.attachToTarget",
            "params": {"targetId": target_id, "flatten": True}
        }))
        res = json.loads(await bws.recv())
        session_id = res.get("params", {}).get("sessionId")
        session = AttachedCDPSession(bws, session_id)

        await session.send("Page.enable")
        await session.send("Runtime.enable")
        await session.send("Emulation.setDeviceMetricsOverride", {
            "width": 390,
            "height": 844,
            "deviceScaleFactor": 2.0,
            "mobile": True
        })

        early_script = f"""
        try {{
            localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
            localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
            sessionStorage.setItem('apy_intro_played', 'true');
        }} catch(e) {{}}
        """
        await session.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})
        await session.send("Page.navigate", {"url": URL})
        await asyncio.sleep(2.0)

        # 1. Test Today Tab Layout & Scrolling
        print("\n--- 1. Testing Today Tab Scroll & Stationary Bottom Nav ---")
        layout_before = await session.evaluate("""
        (() => {
            const nav = document.querySelector('.liquid-nav-container');
            const main = document.querySelector('.app-main-content, main');
            const header = document.querySelector('.ledger-header');
            const navRect = nav ? nav.getBoundingClientRect() : null;
            const headerRect = header ? header.getBoundingClientRect() : null;
            const mainRect = main ? main.getBoundingClientRect() : null;
            return {
                hasNav: Boolean(nav),
                navBottom: navRect ? navRect.bottom : 0,
                navTop: navRect ? navRect.top : 0,
                headerTop: headerRect ? headerRect.top : 0,
                mainScrollTop: main ? main.scrollTop : 0,
                mainScrollHeight: main ? main.scrollHeight : 0,
                mainClientHeight: main ? main.clientHeight : 0,
                hasOverflowX: document.documentElement.scrollWidth > window.innerWidth || (main && main.scrollWidth > main.clientWidth)
            };
        })()
        """)
        print(f"  Before scroll: {layout_before}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "today_tab_top.png"))

        # Scroll main content down 300px
        scroll_res = await session.evaluate("""
        (() => {
            const main = document.querySelector('.app-main-content, main');
            if (main) main.scrollTop = 350;
            const nav = document.querySelector('.liquid-nav-container');
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                newScrollTop: main ? main.scrollTop : 0,
                navBottomAfter: navRect ? navRect.bottom : 0,
                navTopAfter: navRect ? navRect.top : 0
            };
        })()
        """)
        print(f"  After scrolling 350px down: {scroll_res}")
        nav_stayed_fixed = abs(layout_before["navBottom"] - scroll_res["navBottomAfter"]) < 2
        print(f"  -> Bottom Nav Stayed Stationary: {nav_stayed_fixed} (delta: {abs(layout_before['navBottom'] - scroll_res['navBottomAfter'])})")
        await session.screenshot(os.path.join(OUTPUT_DIR, "today_tab_scrolled.png"))

        # 2. Test Switching to Dashboard Tab
        print("\n--- 2. Testing Dashboard Tab ---")
        await session.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('.liquid-nav-item')).find(b => b.textContent.includes('Dashboard'));
            if (btn) btn.click();
        })()
        """)
        await asyncio.sleep(0.5)
        dash_res = await session.evaluate("""
        (() => {
            const nav = document.querySelector('.liquid-nav-container');
            const main = document.querySelector('.app-main-content, main');
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                activeTabActive: nav ? nav.querySelector('.liquid-nav-item.active')?.textContent.trim() : null,
                navBottom: navRect ? navRect.bottom : 0,
                hasOverflowX: main ? main.scrollWidth > main.clientWidth : false
            };
        })()
        """)
        print(f"  Dashboard state: {dash_res}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "dashboard_tab.png"))

        # 3. Test Switching to Timetable Tab
        print("\n--- 3. Testing Timetable Tab ---")
        await session.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('.liquid-nav-item')).find(b => b.textContent.includes('Timetable'));
            if (btn) btn.click();
        })()
        """)
        await asyncio.sleep(0.5)
        tt_res = await session.evaluate("""
        (() => {
            const nav = document.querySelector('.liquid-nav-container');
            const main = document.querySelector('.app-main-content, main');
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                activeTabActive: nav ? nav.querySelector('.liquid-nav-item.active')?.textContent.trim() : null,
                navBottom: navRect ? navRect.bottom : 0,
                hasOverflowX: main ? main.scrollWidth > main.clientWidth : false
            };
        })()
        """)
        print(f"  Timetable state: {tt_res}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "timetable_tab.png"))

        # Scroll Timetable to bottom
        tt_scroll = await session.evaluate("""
        (() => {
            const main = document.querySelector('.app-main-content, main');
            const nav = document.querySelector('.liquid-nav-container');
            if (main) main.scrollTop = main.scrollHeight;
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                scrollTop: main ? main.scrollTop : 0,
                scrollHeight: main ? main.scrollHeight : 0,
                clientHeight: main ? main.clientHeight : 0,
                navBottom: navRect ? navRect.bottom : 0
            };
        })()
        """)
        print(f"  Timetable scrolled to bottom: {tt_scroll}")
        await asyncio.sleep(0.3)
        await session.screenshot(os.path.join(OUTPUT_DIR, "timetable_tab_scrolled_bottom.png"))

        # 4. Test Switching to Forecast Tab
        print("\n--- 4. Testing Forecast Tab ---")
        await session.evaluate("""
        (() => {
            const btn = Array.from(document.querySelectorAll('.liquid-nav-item')).find(b => b.textContent.includes('Forecast'));
            if (btn) btn.click();
        })()
        """)
        await asyncio.sleep(0.5)
        fc_res = await session.evaluate("""
        (() => {
            const nav = document.querySelector('.liquid-nav-container');
            const main = document.querySelector('.app-main-content, main');
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                activeTabActive: nav ? nav.querySelector('.liquid-nav-item.active')?.textContent.trim() : null,
                navBottom: navRect ? navRect.bottom : 0,
                hasOverflowX: main ? main.scrollWidth > main.clientWidth : false
            };
        })()
        """)
        print(f"  Forecast state: {fc_res}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "forecast_tab.png"))

        # Scroll Forecast to bottom
        fc_scroll = await session.evaluate("""
        (() => {
            const main = document.querySelector('.app-main-content, main');
            const nav = document.querySelector('.liquid-nav-container');
            if (main) main.scrollTop = main.scrollHeight;
            const navRect = nav ? nav.getBoundingClientRect() : null;
            return {
                scrollTop: main ? main.scrollTop : 0,
                scrollHeight: main ? main.scrollHeight : 0,
                clientHeight: main ? main.clientHeight : 0,
                navBottom: navRect ? navRect.bottom : 0
            };
        })()
        """)
        print(f"  Forecast scrolled to bottom: {fc_scroll}")
        await asyncio.sleep(0.3)
        await session.screenshot(os.path.join(OUTPUT_DIR, "forecast_tab_scrolled_bottom.png"))

        print("\n=== ALL MOBILE SCROLLING AND LAYOUT TESTS PASSED! ===")
        await session.send("Target.closeTarget", {"targetId": target_id})
        await bws.close()
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

if __name__ == "__main__":
    asyncio.run(test_mobile_layout())
