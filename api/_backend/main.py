import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, backup_db
from seed_data import seed_database
from routers.auth_routes import router as auth_router
from routers.section_routes import router as section_router
from routers.attendance_routes import router as attendance_router
from routers.notification_routes import router as notification_router
from routers.admin_routes import router as admin_router
from notifications import dispatch_scheduled_reminders
from auth import get_current_user, get_current_admin_user

# Setup background scheduler for local/dedicated servers only
scheduler = None
if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
        scheduler.add_job(dispatch_scheduled_reminders, "cron", minute="*", id="attendance_reminders", replace_existing=True)
        scheduler.start()
    except Exception as e:
        print("Scheduler init note:", e)

# Only run schema init and seeding on local startup (production DB is already migrated)
if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    try:
        init_db()
        seed_database()
    except Exception as e:
        print("Database init note:", e)

app = FastAPI(
    title="ATT PER Y API",
    description="Multi-user attendance tracking API with SQLite WAL mode, FAT forecaster, and 75% threshold calculator",
    version="1.0.0"
)

# CORS Lockdown: Restrict to explicit application origins
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1",
    "https://127.0.0.1",
    "https://att-per-y.vercel.app",
    "https://apy-attendance.vercel.app",
    "https://apy-i1s1.vercel.app",
    "https://apy-mu.vercel.app",
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost",
    "null",
]
custom_origins = os.environ.get("ALLOWED_ORIGINS", "")
if custom_origins:
    for o in custom_origins.split(","):
        if o.strip() and o.strip() not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import RedirectResponse, JSONResponse
import traceback

@app.middleware("http")
async def security_and_https_middleware(request: Request, call_next):
    # Production HTTPS enforcement: only redirect GET/HEAD web page requests, never preflight OPTIONS or API routes
    if request.method not in ["OPTIONS", "POST", "PUT", "DELETE", "PATCH"] and not request.url.path.startswith("/api"):
        proto = request.headers.get("x-forwarded-proto")
        if proto == "http" and (os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")):
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)
        
    response = await call_next(request)
    # Security hardening transport headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Include routers under both /api and root prefixes for seamless local + Vercel deployment
for pfx in ["/api", ""]:
    app.include_router(auth_router, prefix=pfx)
    app.include_router(section_router, prefix=pfx)
    app.include_router(attendance_router, prefix=pfx)
    app.include_router(notification_router, prefix=pfx)
    app.include_router(admin_router, prefix=pfx)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print("UNHANDLED SERVER ERROR:", exc)
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Server Error: {str(exc)}",
            "type": type(exc).__name__
        }
    )

@app.get("/api/health")
@app.get("/health")
def health_check():
    return {"status": "ok", "app": "ATT PER Y"}

@app.post("/api/admin/backup")
@app.post("/admin/backup")
def trigger_backup(request: Request, current_user: dict = Depends(get_current_admin_user)):
    # Secure backup endpoint with admin role enforcement & audit logging
    backup_file = backup_db()
    admin_reg = current_user.get("register_number", "ADMIN")
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
    from database import log_admin_action
    log_admin_action(
        admin_reg=admin_reg,
        action="TRIGGER_BACKUP",
        details=f"Database snapshot saved: {os.path.basename(backup_file)}",
        ip_address=client_ip
    )
    return {
        "status": "success",
        "backup_file": os.path.basename(backup_file),
        "message": "Database snapshot saved successfully."
    }

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve frontend build seamlessly on local development backend port 8000
if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
    if not os.path.exists(dist_dir):
        dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")

    if os.path.exists(dist_dir):
        assets_dir = os.path.join(dist_dir, "assets")
        if os.path.exists(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/sw.js")
        def service_worker():
            sw_file = os.path.join(dist_dir, "sw.js")
            if os.path.exists(sw_file):
                return FileResponse(sw_file, media_type="application/javascript")
            return JSONResponse(status_code=404, content={"error": "sw not found"})

        @app.get("/{full_path:path}")
        def serve_spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API endpoint not found")
            index_file = os.path.join(dist_dir, "index.html")
            if os.path.exists(index_file):
                return FileResponse(index_file)
            return {"app": "ATT PER Y"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
