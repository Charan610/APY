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

async def run_4stage_inspection(bws):
    print("\n" + "="*60)
    print("TEST: 4-STAGE CALM SEQUENTIAL INTRO VERIFICATION (1280x800)")
    print("="*60)

    session, target_id = await create_session(bws, 1280, 800, False)

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

    # Stage 1: Logo & Title Centered (0.4s)
    await asyncio.sleep(0.4)
    s1 = await session.evaluate("""
    (() => {
        const brand = document.querySelector('.intro-brand-stage');
        const dash = document.querySelector('.dashboard-content-layer');
        if (!brand) return { ok: false, error: 'Brand stage missing' };
        const bRect = brand.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const bCenterX = bRect.left + bRect.width / 2;
        const bCenterY = bRect.top + bRect.height / 2;
        return {
            ok: true,
            isNearCenterX: Math.abs(bCenterX - winW / 2) < 5,
            isNearCenterY: Math.abs(bCenterY - winH / 2) < 20,
            dashHidden: dash ? window.getComputedStyle(dash).opacity === '0' : false
        };
    })()
    """)
    print(f"  Stage 1 (Brand Entrance): {s1}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "stage1_brand_center.png"))

    # Stage 2: Logo Drifting Up & Fading Out (1.0s)
    await asyncio.sleep(0.6)
    s2 = await session.evaluate("""
    (() => {
        const brand = document.querySelector('.intro-brand-stage');
        const dash = document.querySelector('.dashboard-content-layer');
        return {
            brandStillMounted: Boolean(brand),
            brandOpacity: brand ? parseFloat(window.getComputedStyle(brand).opacity) : 0,
            dashHidden: dash ? window.getComputedStyle(dash).opacity === '0' : false
        };
    })()
    """)
    print(f"  Stage 2 (Brand Exit): {s2}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "stage2_brand_exit.png"))

    # Stage 3: Attendance Ring & Number Counting Up (1.8s)
    await asyncio.sleep(0.8)
    s3 = await session.evaluate("""
    (() => {
        const att = document.querySelector('.intro-attendance-stage');
        const visual = document.querySelector('.attendance-visual');
        const pct = document.querySelector('.attendance-percentage-layer');
        const label = document.querySelector('.intro-ring-label');
        const counts = document.querySelector('.intro-ring-counts');
        const dash = document.querySelector('.dashboard-content-layer');
        if (!att || !visual || !pct) return { ok: false };
        const vRect = visual.getBoundingClientRect();
        const pRect = pct.getBoundingClientRect();
        const lRect = label.getBoundingClientRect();
        const cRect = counts.getBoundingClientRect();
        return {
            ok: true,
            visualSquare: vRect.width === vRect.height,
            isPctCentered: Math.abs((vRect.left + vRect.width/2) - (pRect.left + pRect.width/2)) < 2,
            labelAboveRing: lRect.bottom <= vRect.top - 12,
            countsBelowRing: cRect.top >= vRect.bottom + 12,
            pctText: pct.textContent.trim(),
            dashHidden: dash ? window.getComputedStyle(dash).opacity === '0' : false
        };
    })()
    """)
    print(f"  Stage 3 (Ring & Synchronized Count-up): {s3}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "stage3_ring_active.png"))

    # Stage 3 Settled: Real Attendance Hold (2.5s)
    await asyncio.sleep(0.7)
    s3_settled = await session.evaluate("""
    (() => {
        const pct = document.querySelector('.attendance-percentage-layer');
        return {
            pct: pct ? pct.textContent.trim() : null
        };
    })()
    """)
    print(f"  Stage 3 Settled (Steady Hold): {s3_settled}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "stage3_settled_hold.png"))

    # Stage 4: Cross-fade & Final Settled State (3.4s)
    await asyncio.sleep(0.9)
    s4 = await session.evaluate("""
    (() => {
        const intro = document.querySelector('.intro-portal-viewport');
        const dash = document.querySelector('.dashboard-content-layer');
        const allCrests = document.querySelectorAll('.brand-crest');
        const allWidgets = document.querySelectorAll('.today-attendance-widget');
        return {
            introUnmounted: !intro,
            dashVisible: dash ? window.getComputedStyle(dash).opacity === '1' : false,
            crestsCount: allCrests.length,
            widgetsCount: allWidgets.length
        };
    })()
    """)
    print(f"  Stage 4 (Final Settled Dashboard): {s4}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "stage4_dashboard_settled.png"))

    await session.send("Target.closeTarget", {"targetId": target_id})

async def run_viewport_check(bws, width, height, name, mobile=False):
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

    # Wait for full animation (3.2s)
    await asyncio.sleep(3.3)

    res = await session.evaluate("""
    (() => {
        const intro = document.querySelector('.intro-portal-viewport');
        const allCrests = document.querySelectorAll('.brand-crest');
        const allWidgets = document.querySelectorAll('.today-attendance-widget');
        const target = document.querySelector('.today-attendance-widget');
        const pct = target ? target.querySelector('.gauge-pct-num')?.textContent.trim() : null;
        return {
            introUnmounted: !intro,
            crests: allCrests.length,
            widgets: allWidgets.length,
            pct: pct,
            overflowX: document.documentElement.scrollWidth > window.innerWidth
        };
    })()
    """)
    print(f"  Result on {name}: {res}")
    await session.screenshot(os.path.join(OUTPUT_DIR, f"final_{name}_{width}.png"))
    await session.send("Target.closeTarget", {"targetId": target_id})

async def check_about_modal(bws):
    print("\n--- Verifying About Modal with BrandLogo & v1.4.2 ---")
    session, target_id = await create_session(bws, 390, 844, True)

    early_script = f"""
    try {{
        localStorage.setItem('attendance_jwt_token', '{AUTH_DATA["token"]}');
        localStorage.setItem('attendance_user', JSON.stringify({json.dumps(AUTH_DATA["user"])}));
        sessionStorage.setItem('apy_intro_played', 'true');
    }} catch(e) {{}}
    """
    await session.send("Page.addScriptToEvaluateOnNewDocument", {"source": early_script})
    await session.send("Page.navigate", {"url": URL})
    await asyncio.sleep(1.5)

    # Click settings button in header
    await session.evaluate("""
    (() => {
        const btn = document.querySelector('button[title="Settings & Baseline"]');
        if (btn) btn.click();
    })()
    """)
    await asyncio.sleep(0.6)

    # Click About tab
    await session.evaluate("""
    (() => {
        const tabs = Array.from(document.querySelectorAll('.settings-tab-btn, button'));
        const aboutTab = tabs.find(b => b.textContent.trim().toLowerCase() === 'about');
        if (aboutTab) aboutTab.click();
    })()
    """)
    await asyncio.sleep(0.6)

    res = await session.evaluate("""
    (() => {
        const modal = document.querySelector('.settings-modal');
        const brandLogo = modal ? modal.querySelector('.brand-logo-svg') : null;
        const brandTitle = modal ? modal.querySelector('.heading-ledger') : null;
        const versionSpan = modal ? Array.from(modal.querySelectorAll('span')).find(s => s.textContent.includes('v1.4.2')) : null;
        return {
            hasModal: Boolean(modal),
            hasBrandLogo: Boolean(brandLogo),
            titleText: brandTitle ? brandTitle.textContent.trim() : null,
            versionText: versionSpan ? versionSpan.textContent.trim() : null
        };
    })()
    """)
    print(f"  About Modal Check Result: {res}")
    await session.screenshot(os.path.join(OUTPUT_DIR, "about_modal_v142.png"))
    await session.send("Target.closeTarget", {"targetId": target_id})

async def main():
    chrome_proc = start_chrome()
    try:
        v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version").read())
        bws = await websockets.connect(v["webSocketDebuggerUrl"], max_size=30*1024*1024)

        # 1. 4-Stage Timeline Inspection
        await run_4stage_inspection(bws)

        # 2. Key Viewport Checks requested (375px mobile, 1920px desktop)
        viewports = [
            (375, 812, "mobile_375", True),
            (390, 844, "mobile_390", True),
            (1920, 1080, "desktop_1920", False)
        ]

        for w, h, name, mob in viewports:
            await run_viewport_check(bws, w, h, name, mob)

        # 3. Check About modal with BrandLogo & v1.4.2
        await check_about_modal(bws)

        await bws.close()
        print("\n=== ALL TESTS AND VIEWPORTS COMPLETED SUCCESSFULLY! ===")

    finally:
        chrome_proc.terminate()
        time.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(main())
