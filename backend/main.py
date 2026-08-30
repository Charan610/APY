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
from notifications import dispatch_scheduled_reminders
from auth import get_current_user

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

# Ensure DB is initialized
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

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(section_router)
app.include_router(attendance_router)
app.include_router(notification_router)

from fastapi.responses import JSONResponse
import traceback

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
def health_check():
    return {"status": "ok", "app": "ATT PER Y"}

@app.post("/api/admin/backup")
def trigger_backup(current_user: dict = Depends(get_current_user)):
    # Simple backup endpoint for data durability
    backup_file = backup_db()
    return {
        "status": "success",
        "backup_file": os.path.basename(backup_file),
        "message": "Database snapshot saved successfully."
    }

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve frontend build seamlessly on local backend port 8000
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
