import asyncio
import json
import os
import subprocess
import time
import urllib.request
import base64
import websockets

CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9222
URL = "http://localhost:5190"
OUTPUT_DIR = "/Users/charan/.gemini/antigravity-ide/brain/ce463863-5aee-4b43-ae48-516dcbfae70f/scratch/flight_validation"

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
        self.msg_id += 1
        mid = self.msg_id
        payload = {
            "id": mid,
            "sessionId": self.session_id,
            "method": method,
            "params": params or {}
        }
        await self.bws.send(json.dumps(payload))
        while True:
            try:
                raw = await asyncio.wait_for(self.bws.recv(), timeout=6.0)
                resp = json.loads(raw)
                if resp.get("id") == mid:
                    if "error" in resp:
                        print(f"  [CDP Error] {method}: {resp['error']}")
                    return resp.get("result", {})
            except asyncio.TimeoutError:
                print(f"  [Timeout] waiting for response to {method}")
                return {}

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
    for _ in range(25):
        time.sleep(0.2)
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/version", timeout=1) as resp:
                if resp.status == 200:
                    return proc
        except Exception:
            pass
    return proc

async def test_intro_flight():
    chrome_proc = start_chrome()
    try:
        url = f"http://localhost:{PORT}/json/version"
        req = urllib.request.urlopen(url)
        info = json.loads(req.read().decode())
        bws = await websockets.connect(info["webSocketDebuggerUrl"], max_size=30000000)

        # Get or create target
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
            sessionStorage.removeItem('apy_intro_played');
            localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
            localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
            localStorage.setItem('attendance_summary', JSON.stringify({json.dumps(AUTH_DATA["summary"])}));
            window.__APY_ANIM_SPEED = 1.0;
        }} catch(e) {{}}
        """
        await session.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})
        await session.send("Page.navigate", {"url": URL})

        print("\n=== VERIFYING INTRO FLIGHT & SETTLEMENT ANIMATION ===")
        # Wait for page load
        await asyncio.sleep(0.3)

        # Frame 1: Stage 1 (Centered entrance: 0 to 600ms)
        f1 = await session.evaluate("""
        (() => {
            const flightLogo = document.querySelector('.flight-logo-crest');
            const flightTitle = document.querySelector('.flight-brand-title');
            const lRect = flightLogo ? flightLogo.getBoundingClientRect() : null;
            const tRect = flightTitle ? flightTitle.getBoundingClientRect() : null;
            const scrim = document.querySelector('.intro-scrim-layer');
            return {
                hasFlightLogo: !!flightLogo,
                hasFlightTitle: !!flightTitle,
                logoY: lRect ? lRect.top : null,
                logoX: lRect ? lRect.left : null,
                titleY: tRect ? tRect.top : null,
                hasScrim: !!scrim
            };
        })()
        """)
        print(f"  Stage 1 (Centered appearance): {f1}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "frame1_center.png"))

        # Wait for flight upwards (Stage 2: ~900ms)
        await asyncio.sleep(0.6)

        f2 = await session.evaluate("""
        (() => {
            const flightLogo = document.querySelector('.flight-logo-crest');
            const flightTitle = document.querySelector('.flight-brand-title');
            const lRect = flightLogo ? flightLogo.getBoundingClientRect() : null;
            const tRect = flightTitle ? flightTitle.getBoundingClientRect() : null;
            return {
                hasFlightLogo: !!flightLogo,
                hasFlightTitle: !!flightTitle,
                logoY: lRect ? lRect.top : null,
                titleY: tRect ? tRect.top : null
            };
        })()
        """)
        print(f"  Stage 2 (In Flight Gliding to Top): {f2}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "frame2_in_flight.png"))

        # Wait for landing & Attendance Hero (Stage 3: ~1800ms)
        await asyncio.sleep(0.9)

        f3 = await session.evaluate("""
        (() => {
            const headerLogo = document.querySelector('.ledger-header .brand-crest');
            const hero = document.querySelector('.intro-attendance-hero');
            const pct = document.querySelector('.attendance-percentage-val');
            const hLogoStyle = headerLogo ? window.getComputedStyle(headerLogo) : null;
            return {
                headerLogoOpacity: hLogoStyle ? hLogoStyle.opacity : null,
                hasHero: !!hero,
                percentageText: pct ? pct.textContent.trim() : null
            };
        })()
        """)
        print(f"  Stage 3 (Landed at Top + Centered Percentage Ring): {f3}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "frame3_landed_hero.png"))

        # Wait for morph to widget (Stage 4: ~2900ms)
        await asyncio.sleep(1.0)
        f4 = await session.evaluate("""
        (() => {
            const hero = document.querySelector('.intro-attendance-hero');
            const widget = document.querySelector('.today-hero-right > div');
            const wStyle = widget ? window.getComputedStyle(widget) : null;
            return {
                hasHero: !!hero,
                widgetOpacity: wStyle ? wStyle.opacity : null
            };
        })()
        """)
        print(f"  Stage 4 (Settled into Today Widget): {f4}")
        await session.screenshot(os.path.join(OUTPUT_DIR, "frame4_widget_revealed.png"))

        print("\n=== ALL INTRO FLIGHT & SETTLEMENT TESTS COMPLETED! ===")
        await session.send("Target.closeTarget", {"targetId": target_id})
        await bws.close()
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

if __name__ == "__main__":
    asyncio.run(test_intro_flight())
