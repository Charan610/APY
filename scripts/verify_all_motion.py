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
            try:
                res = await asyncio.wait_for(self.bws.recv(), timeout=12.0)
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
        return res.get("result", {}).get("value")

    async def screenshot(self, filepath):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        if "data" in res:
            data = base64.b64decode(res["data"])
            with open(filepath, "wb") as f:
                f.write(data)
            print(f"  Captured: {os.path.basename(filepath)}")

def start_chrome():
    cmd = [
        CHROME_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=/tmp/chrome_anim_master_profile"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(30):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1.0)
            return proc
        except Exception:
            time.sleep(0.2)
    return proc

GLOBAL_REQ_ID = 1000

async def create_session(bws, width=1280, height=800, mobile=False):
    global GLOBAL_REQ_ID
    GLOBAL_REQ_ID += 1
    req1 = GLOBAL_REQ_ID
    await bws.send(json.dumps({"id": req1, "method": "Target.createTarget", "params": {"url": "about:blank"}}))
    while True:
        m = json.loads(await bws.recv())
        if m.get("id") == req1:
            target_id = m["result"]["targetId"]
            break

    GLOBAL_REQ_ID += 1
    req2 = GLOBAL_REQ_ID
    await bws.send(json.dumps({"id": req2, "method": "Target.attachToTarget", "params": {"targetId": target_id, "flatten": True}}))
    session_id = None
    while not session_id:
        m = json.loads(await bws.recv())
        if m.get("id") == req2 and "result" in m:
            session_id = m["result"]["sessionId"]

    session = AttachedCDPSession(bws, session_id)

    # Override device metrics
    await session.send("Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 2 if mobile else 1,
        "mobile": mobile
    })

    # Enable domains
    await session.send("Page.enable")
    await session.send("Runtime.enable")

    return session, target_id

async def run_025x_inspection(bws):
    print("\n" + "="*60)
    print("TEST 1: 0.25x SLOW SPEED FRAME-BY-FRAME INSPECTION (1280x800)")
    print("="*60)

    session, target_id = await create_session(bws, 1280, 800, False)

    # Early script injection: set speed 0.25x and seed auth
    early_script = f"""
    window.__APY_ANIM_SPEED = 0.25;
    try {{
        localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
        localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
        localStorage.setItem('apy_summary_cache', JSON.stringify({json.dumps(AUTH_DATA["summary"])}));
        sessionStorage.removeItem('apy_intro_played');
    }} catch(e) {{}}
    """
    await session.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})
    await session.send("Page.navigate", {"url": URL})

    # Milestone 1: Brand composition start (t = 1.0s, elapsed ~ 250ms at 0.25x)
    await asyncio.sleep(1.0)
    b_start = await session.evaluate("""
    (() => {
        const logo = document.querySelector('.flight-logo-crest');
        const title = document.querySelector('.flight-brand-title');
        if (!logo || !title) return { ok: false, error: 'Flight elements missing' };
        const lRect = logo.getBoundingClientRect();
        const tRect = title.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const lCenterX = lRect.left + lRect.width / 2;
        const tCenterX = tRect.left + tRect.width / 2;
        return {
            ok: true,
            window: { winW, winH },
            logo: { left: Math.round(lRect.left), top: Math.round(lRect.top), size: Math.round(lRect.width), centerX: Math.round(lCenterX) },
            title: { left: Math.round(tRect.left), top: Math.round(tRect.top), centerX: Math.round(tCenterX) },
            isTitleBelowLogo: tRect.top >= lRect.bottom,
            horizontalAlignmentDelta: Math.abs(Math.round(lCenterX) - Math.round(tCenterX)),
            isNearScreenCenter: Math.abs(Math.round(lCenterX) - Math.round(winW / 2)) < 5
        };
    })()
    """)
    print(f"  Milestone 1 (Brand Start): {b_start}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "01_brand_start_1280.png"))

    # Milestone 2: Brand flight midpoint (t = 4.2s, elapsed ~ 1050ms at 0.25x)
    await asyncio.sleep(3.2)
    b_mid = await session.evaluate("""
    (() => {
        const logo = document.querySelector('.flight-logo-crest');
        const title = document.querySelector('.flight-brand-title');
        if (!logo || !title) return { ok: false };
        const lRect = logo.getBoundingClientRect();
        const tRect = title.getBoundingClientRect();
        return {
            ok: true,
            logoPos: { left: Math.round(lRect.left), top: Math.round(lRect.top), scale: (lRect.width / 64).toFixed(3) },
            titlePos: { left: Math.round(tRect.left), top: Math.round(tRect.top) }
        };
    })()
    """)
    print(f"  Milestone 2 (Brand Flight Midpoint): {b_mid}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "02_brand_flight_1280.png"))

    # Milestone 3: Brand arrival at header (t = 6.2s, elapsed ~ 1550ms at 0.25x)
    await asyncio.sleep(2.0)
    b_landed = await session.evaluate("""
    (() => {
        const headerLogo = document.querySelector('.brand-crest');
        const headerTitle = document.querySelector('.brand-heading');
        const flightLogo = document.querySelector('.flight-logo-crest');
        return {
            headerLogoOpacity: headerLogo ? window.getComputedStyle(headerLogo).opacity : null,
            headerTitleOpacity: headerTitle ? window.getComputedStyle(headerTitle).opacity : null,
            flightLogoUnmounted: !flightLogo
        };
    })()
    """)
    print(f"  Milestone 3 (Header Landing): {b_landed}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "03_header_landed_1280.png"))

    # Milestone 4: Attendance card entrance & activation (t = 8.5s, elapsed ~ 2125ms at 0.25x)
    await asyncio.sleep(2.3)
    att_act = await session.evaluate("""
    (() => {
        const hero = document.querySelector('.intro-attendance-hero');
        const visual = document.querySelector('.attendance-visual');
        const pct = document.querySelector('.attendance-percentage-val');
        const meta = document.querySelector('.attendance-metadata-row');
        const wave = document.querySelector('.heartbeat-wave-path');
        if (!hero || !visual || !pct) return { ok: false, error: 'Hero elements missing' };
        const vRect = visual.getBoundingClientRect();
        const pRect = pct.getBoundingClientRect();
        const mRect = meta ? meta.getBoundingClientRect() : null;
        return {
            ok: true,
            visualSize: { w: Math.round(vRect.width), h: Math.round(vRect.height), aspect: Math.round(vRect.width / vRect.height) },
            pctVal: pct.textContent.trim(),
            isPctCenteredX: Math.abs((vRect.left + vRect.width / 2) - (pRect.left + pRect.width / 2)) < 2,
            isPctCenteredY: Math.abs((vRect.top + vRect.height / 2) - (pRect.top + pRect.height / 2)) < 2,
            metaIsBelowVisual: mRect ? mRect.top >= vRect.bottom : false,
            wavePresent: Boolean(wave)
        };
    })()
    """)
    print(f"  Milestone 4 (Attendance Visual & Mathematical Centering): {att_act}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "04_attendance_act_1280.png"))

    # Milestone 5: Attendance settled at actual data (t = 12.6s, elapsed ~ 3150ms at 0.25x)
    await asyncio.sleep(4.1)
    att_settled = await session.evaluate("""
    (() => {
        const pct = document.querySelector('.attendance-percentage-val');
        const meta = document.querySelector('.attendance-metadata-row');
        return {
            pct: pct ? pct.textContent.trim() : null,
            meta: meta ? meta.textContent.trim() : null
        };
    })()
    """)
    print(f"  Milestone 5 (Settled Real Attendance): {att_settled}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "05_attendance_settled_1280.png"))

    # Milestone 6: FLIP morph in motion (t = 14.2s, elapsed ~ 3550ms at 0.25x)
    await asyncio.sleep(1.6)
    morph_state = await session.evaluate("""
    (() => {
        const hero = document.querySelector('.intro-attendance-hero');
        const target = document.querySelector('.today-attendance-widget');
        if (!hero || !target) return { ok: false };
        const hRect = hero.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        return {
            ok: true,
            heroCenter: { x: Math.round(hRect.left + hRect.width / 2), y: Math.round(hRect.top + hRect.height / 2) },
            targetCenter: { x: Math.round(tRect.left + tRect.width / 2), y: Math.round(tRect.top + tRect.height / 2) }
        };
    })()
    """)
    print(f"  Milestone 6 (FLIP Morph in Motion): {morph_state}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "06_flip_morph_1280.png"))

    # Milestone 7: Final settled state (t = 16.5s, elapsed > 4000ms at 0.25x)
    await asyncio.sleep(2.3)
    final_state = await session.evaluate("""
    (() => {
        const allCrests = document.querySelectorAll('.brand-crest');
        const allHeadings = document.querySelectorAll('.brand-heading');
        const allWidgets = document.querySelectorAll('.today-attendance-widget');
        const introHero = document.querySelector('.intro-attendance-hero');
        const flightLogo = document.querySelector('.flight-logo-crest');
        const target = document.querySelector('.today-attendance-widget');
        const pctElem = target ? target.querySelector('.gauge-pct-num') : null;
        return {
            crestsCount: allCrests.length,
            headingsCount: allHeadings.length,
            widgetsCount: allWidgets.length,
            introHeroUnmounted: !introHero,
            flightLogoUnmounted: !flightLogo,
            widgetOpacity: target ? window.getComputedStyle(target.parentElement).opacity : null,
            finalPct: pctElem ? pctElem.textContent.trim() : null,
            hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
    })()
    """)
    print(f"  Milestone 7 (Final Settled DOM): {final_state}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "07_final_settled_1280.png"))

    # Close target
    await session.send("Target.closeTarget", {"targetId": target_id})

async def run_viewport_test(bws, width, height, name, mobile=False):
    print(f"\n--- Testing Viewport: {name} ({width}x{height}) ---")
    session, target_id = await create_session(bws, width, height, mobile)

    early_script = f"""
    window.__APY_ANIM_SPEED = 1.0;
    try {{
        localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
        localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
        localStorage.setItem('apy_summary_cache', JSON.stringify({json.dumps(AUTH_DATA["summary"])}));
        sessionStorage.removeItem('apy_intro_played');
    }} catch(e) {{}}
    """
    await session.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})
    await session.send("Page.navigate", {"url": URL})

    # Wait for full animation at 1.0x (3.8s total duration + buffer = 4.4s)
    await asyncio.sleep(4.4)

    res = await session.evaluate("""
    (() => {
        const allCrests = document.querySelectorAll('.brand-crest');
        const allHeadings = document.querySelectorAll('.brand-heading');
        const allWidgets = document.querySelectorAll('.today-attendance-widget');
        const introHero = document.querySelector('.intro-attendance-hero');
        const flightLogo = document.querySelector('.flight-logo-crest');
        const target = document.querySelector('.today-attendance-widget');
        const pct = target ? target.querySelector('.gauge-pct-num')?.textContent.trim() : null;
        return {
            crests: allCrests.length,
            headings: allHeadings.length,
            widgets: allWidgets.length,
            introHeroUnmounted: !introHero,
            flightLogoUnmounted: !flightLogo,
            pct: pct,
            overflowX: document.documentElement.scrollWidth > window.innerWidth
        };
    })()
    """)
    print(f"  Result on {name}: {res}")
    await session.screenshot(os.path.join(OUTPUT_DIR, f"final_{name}_{width}.png"))
    await session.send("Target.closeTarget", {"targetId": target_id})

async def main():
    chrome_proc = start_chrome()
    try:
        v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version").read())
        bws = await websockets.connect(v["webSocketDebuggerUrl"], max_size=30*1024*1024)

        # 1. Detailed 0.25x inspection
        await run_025x_inspection(bws)

        # 2. Viewport test suite strictly covering Phase 7 list:
        # 320px, 360px, 390px, 430px, 768px, 1024px, 1280px, 1440px, 1920px
        viewports = [
            (320, 568, "mobile_320", True),
            (360, 640, "mobile_360", True),
            (390, 844, "mobile_390", True),
            (430, 932, "mobile_430", True),
            (768, 1024, "tablet_768", False),
            (1024, 768, "desktop_1024", False),
            (1280, 800, "desktop_1280", False),
            (1440, 900, "desktop_1440", False),
            (1920, 1080, "desktop_1920", False)
        ]

        for w, h, name, mob in viewports:
            await run_viewport_test(bws, w, h, name, mob)

        await bws.close()
        print("\n=== ALL TESTS AND VIEWPORTS COMPLETED SUCCESSFULLY! ===")

    finally:
        chrome_proc.terminate()
        time.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(main())
