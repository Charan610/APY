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
OUTPUT_DIR = "/Users/charan/.gemini/antigravity-ide/brain/ce463863-5aee-4b43-ae48-516dcbfae70f/scratch/anim_validation"

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

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 1

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=30*1024*1024)

    async def send(self, method, params=None):
        mid = self.msg_id
        self.msg_id += 1
        msg = {"id": mid, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(msg))
        while True:
            try:
                res = await asyncio.wait_for(self.ws.recv(), timeout=10.0)
                data = json.loads(res)
                if data.get("id") == mid:
                    if "error" in data:
                        print(f"  CDP error on {method}: {data['error']}")
                    return data.get("result", {})
            except asyncio.TimeoutError:
                print(f"  CDP timeout on {method}")
                return {}

    async def evaluate(self, expr):
        res = await self.send("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        })
        val = res.get("result", {}).get("value")
        return val

    async def screenshot(self, filepath):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        if "data" in res:
            data = base64.b64decode(res["data"])
            with open(filepath, "wb") as f:
                f.write(data)
            print(f"  Saved screenshot: {os.path.basename(filepath)}")

    async def close(self):
        if self.ws:
            await self.ws.close()

def start_chrome(width=1280, height=800):
    cmd = [
        CHROME_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        f"--window-size={width},{height}",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=/tmp/chrome_anim_test_profile_clean"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    return proc

async def run_detailed_inspection():
    print("=== STARTING DETAILED 0.25x SPEED FRAME INSPECTION ===")
    chrome_proc = start_chrome(1280, 800)
    
    try:
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
        ws_url = tabs[0]["webSocketDebuggerUrl"]
        cdp = CDPClient(ws_url)
        await cdp.connect()

        await cdp.send("Page.enable")
        await cdp.send("Runtime.enable")

        # Explicitly set device metrics to 1280x800
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            "width": 1280,
            "height": 800,
            "deviceScaleFactor": 1,
            "mobile": False
        })

        # Inject early script to set speed and auth before any page script mounts
        early_script = f"""
        window.__APY_ANIM_SPEED = 0.25;
        try {{
            localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
            localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
            localStorage.setItem('apy_summary_cache', JSON.stringify({json.dumps(AUTH_DATA["summary"])}));
            sessionStorage.removeItem('apy_intro_played');
        }} catch(e) {{}}
        """
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})

        # Navigate to application
        print("Navigating to http://localhost:5190 at 0.25x speed...")
        await cdp.send("Page.navigate", {"url": URL})

        # Milestone 1: Brand composition start (t = 0.8s at 0.25x speed, p ~ 0.05)
        await asyncio.sleep(0.8)
        brand_info = await cdp.evaluate("""
        (() => {
            const logo = document.querySelector('.flight-logo-crest');
            const title = document.querySelector('.flight-brand-title');
            if (!logo || !title) return { ok: false, error: 'Brand elements not found' };
            const lRect = logo.getBoundingClientRect();
            const tRect = title.getBoundingClientRect();
            return {
                ok: true,
                logo: { left: Math.round(lRect.left), top: Math.round(lRect.top), width: Math.round(lRect.width), centerX: Math.round(lRect.left + lRect.width / 2) },
                title: { left: Math.round(tRect.left), top: Math.round(tRect.top), width: Math.round(tRect.width), centerX: Math.round(tRect.left + tRect.width / 2) },
                isBelow: tRect.top >= lRect.bottom,
                centerDelta: Math.abs(Math.round(lRect.left + lRect.width / 2) - Math.round(tRect.left + tRect.width / 2))
            };
        })()
        """)
        print(f"Milestone 1 (Brand Composition Start): {brand_info}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "01_brand_start.png"))

        # Milestone 2: Brand flight midpoint (t = 4.0s, p ~ 0.24)
        await asyncio.sleep(3.2)
        flight_info = await cdp.evaluate("""
        (() => {
            const logo = document.querySelector('.flight-logo-crest');
            const title = document.querySelector('.flight-brand-title');
            if (!logo || !title) return { ok: false };
            const lRect = logo.getBoundingClientRect();
            const tRect = title.getBoundingClientRect();
            return {
                ok: true,
                logoPos: { left: Math.round(lRect.left), top: Math.round(lRect.top) },
                titlePos: { left: Math.round(tRect.left), top: Math.round(tRect.top) }
            };
        })()
        """)
        print(f"Milestone 2 (Brand Flight Midpoint): {flight_info}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "02_brand_flight.png"))

        # Milestone 3: Brand arrival at header (t = 6.2s, p ~ 0.37)
        await asyncio.sleep(2.2)
        header_settled = await cdp.evaluate("""
        (() => {
            const crest = document.querySelector('.brand-crest:not(.flight-logo-crest)');
            const heading = document.querySelector('.brand-heading:not(.flight-brand-title)');
            const flightLogo = document.querySelector('.flight-logo-crest');
            return {
                headerCrestOpacity: crest ? window.getComputedStyle(crest).opacity : null,
                headerHeadingOpacity: heading ? window.getComputedStyle(heading).opacity : null,
                flightLogoPresent: Boolean(flightLogo)
            };
        })()
        """)
        print(f"Milestone 3 (Header Landing): {header_settled}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "03_header_landed.png"))

        # Milestone 4: Attendance card entrance & activation (t = 7.8s, p ~ 0.46)
        await asyncio.sleep(1.6)
        att_start = await cdp.evaluate("""
        (() => {
            const card = document.querySelector('.intro-attendance-card');
            const visual = document.querySelector('.attendance-visual');
            const pct = document.querySelector('.attendance-percentage-val');
            const meta = document.querySelector('.attendance-metadata-row');
            if (!card || !visual || !pct) return { ok: false };
            const vRect = visual.getBoundingClientRect();
            const pRect = pct.getBoundingClientRect();
            const mRect = meta ? meta.getBoundingClientRect() : null;
            return {
                ok: true,
                visual: { width: Math.round(vRect.width), height: Math.round(vRect.height), aspect: Math.round(vRect.width / vRect.height) },
                pctText: pct.textContent.trim(),
                isPctCenteredX: Math.abs((vRect.left + vRect.width / 2) - (pRect.left + pRect.width / 2)) < 2,
                isPctCenteredY: Math.abs((vRect.top + vRect.height / 2) - (pRect.top + pRect.height / 2)) < 2,
                metaIsBelowVisual: mRect ? mRect.top >= vRect.bottom : false
            };
        })()
        """)
        print(f"Milestone 4 (Attendance Visual & Centering): {att_start}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "04_attendance_activation.png"))

        # Milestone 5: Full progress & heartbeat active (t = 10.2s, p ~ 0.60)
        await asyncio.sleep(2.4)
        att_full = await cdp.evaluate("""
        (() => {
            const pct = document.querySelector('.attendance-percentage-val');
            const wave = document.querySelector('.attendance-heartbeat-layer path');
            const ring = document.querySelector('.attendance-ring-layer circle[stroke*="url"]');
            return {
                pct: pct ? pct.textContent.trim() : null,
                waveOpacity: wave ? window.getComputedStyle(wave).opacity : null,
                ringOffset: ring ? Math.round(Number(ring.getAttribute('stroke-dashoffset') || 0)) : null
            };
        })()
        """)
        print(f"Milestone 5 (Full Attendance & Wave): {att_full}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "05_attendance_full.png"))

        # Milestone 6: Settled at actual value (t = 13.0s, p ~ 0.77)
        await asyncio.sleep(2.8)
        settled_info = await cdp.evaluate("""
        (() => {
            const pct = document.querySelector('.attendance-percentage-val');
            return {
                pct: pct ? pct.textContent.trim() : null
            };
        })()
        """)
        print(f"Milestone 6 (Settled Attendance): {settled_info}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "06_attendance_settled.png"))

        # Milestone 7: FLIP morph in motion (t = 15.0s, p ~ 0.89)
        await asyncio.sleep(2.0)
        morph_info = await cdp.evaluate("""
        (() => {
            const card = document.querySelector('.intro-attendance-card');
            const target = document.querySelector('.today-attendance-widget');
            if (!card || !target) return { ok: false };
            const cRect = card.getBoundingClientRect();
            const tRect = target.getBoundingClientRect();
            return {
                ok: true,
                cardCenter: { x: Math.round(cRect.left + cRect.width / 2), y: Math.round(cRect.top + cRect.height / 2) },
                targetCenter: { x: Math.round(tRect.left + tRect.width / 2), y: Math.round(tRect.top + tRect.height / 2) },
                targetVisibility: window.getComputedStyle(target).visibility
            };
        })()
        """)
        print(f"Milestone 7 (FLIP Morph in Motion): {morph_info}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "07_flip_morph.png"))

        # Milestone 8: Final settled state (t = 17.2s, p ~ 1.00)
        await asyncio.sleep(2.2)
        final_dom = await cdp.evaluate("""
        (() => {
            const allCrests = document.querySelectorAll('.brand-crest');
            const allHeadings = document.querySelectorAll('.brand-heading');
            const allWidgets = document.querySelectorAll('.today-attendance-widget');
            const introPortal = document.querySelector('.intro-attendance-card');
            const target = document.querySelector('.today-attendance-widget');
            return {
                crestsCount: allCrests.length,
                headingsCount: allHeadings.length,
                widgetsCount: allWidgets.length,
                introCardUnmounted: !introPortal,
                finalWidgetVisibility: target ? window.getComputedStyle(target).visibility : null,
                finalWidgetOpacity: target ? window.getComputedStyle(target).opacity : null,
                pctValue: target ? target.querySelector('.gauge-pct-num')?.textContent.trim() : null,
                overflowX: document.documentElement.scrollWidth > window.innerWidth
            };
        })()
        """)
        print(f"Milestone 8 (Final DOM Verification): {final_dom}")
        await cdp.screenshot(os.path.join(OUTPUT_DIR, "08_final_settled.png"))

        await cdp.close()

    finally:
        chrome_proc.terminate()
        time.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(run_detailed_inspection())
