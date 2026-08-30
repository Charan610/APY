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

# Setup background scheduler for local/dedicated servers
scheduler = None
try:
    if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
        scheduler.add_job(dispatch_scheduled_reminders, "cron", minute="*", id="attendance_reminders", replace_existing=True)
except Exception as e:
    print("Scheduler init note:", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB and seed default data
    init_db()
    seed_database()
    if scheduler:
        try:
            scheduler.start()
        except Exception as e:
            print("Scheduler start note:", e)
    yield
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)

app = FastAPI(
    title="ATT PER Y API",
    description="Multi-user attendance tracking API with SQLite WAL mode, FAT forecaster, and 75% threshold calculator",
    version="1.0.0",
    lifespan=lifespan
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
