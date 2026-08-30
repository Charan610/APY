from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from database import get_db
from auth import get_current_user
from notifications import (
    get_vapid_public_key,
    PREBUILT_TIMES,
    send_push_notification,
    dispatch_scheduled_reminders
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class NotificationTimeItem(BaseModel):
    time_of_day: str = Field(..., example="09:00", pattern=r"^\d{2}:\d{2}$")
    label: Optional[str] = None
    is_prebuilt: bool = False

class NotificationPreferencesRequest(BaseModel):
    enabled: bool
    times: List[NotificationTimeItem] = []

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys

class UnsubscribeRequest(BaseModel):
    endpoint: Optional[str] = None

@router.get("/config")
def get_notification_config(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    public_key = get_vapid_public_key()
    
    with get_db() as db:
        cursor = db.cursor()
        
        # Check preferences
        cursor.execute("SELECT enabled FROM notification_preferences WHERE user_id = ?", (user_id,))
        pref = cursor.fetchone()
        has_preferences = pref is not None
        enabled = bool(pref["enabled"]) if pref else False

        # Get active times
        cursor.execute("""
            SELECT time_of_day, label, is_prebuilt 
            FROM notification_times 
            WHERE user_id = ?
            ORDER BY time_of_day ASC
        """, (user_id,))
        times_rows = cursor.fetchall()
        active_times = [
            {
                "time_of_day": r["time_of_day"],
                "label": r["label"],
                "is_prebuilt": bool(r["is_prebuilt"])
            }
            for r in times_rows
        ]

        # Check subscription count
        cursor.execute("SELECT COUNT(*) as count FROM notification_subscriptions WHERE user_id = ?", (user_id,))
        sub_count = cursor.fetchone()["count"]

    return {
        "vapid_public_key": public_key,
        "has_preferences": has_preferences,
        "enabled": enabled,
        "prebuilt_options": PREBUILT_TIMES,
        "active_times": active_times,
        "subscription_count": sub_count
    }

@router.post("/preferences")
def update_notification_preferences(
    req: NotificationPreferencesRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    with get_db() as db:
        cursor = db.cursor()
        
        # Check if preferences row exists (standard SQL upsert pattern)
        cursor.execute("SELECT id FROM notification_preferences WHERE user_id = ?", (user_id,))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE notification_preferences 
                SET enabled = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE user_id = ?
            """, (1 if req.enabled else 0, user_id))
        else:
            cursor.execute("""
                INSERT INTO notification_preferences (user_id, enabled) 
                VALUES (?, ?)
            """, (user_id, 1 if req.enabled else 0))

        # Clear existing times and insert fresh ones in a single batch
        cursor.execute("DELETE FROM notification_times WHERE user_id = ?", (user_id,))
        
        if req.times:
            time_params = [
                (user_id, t.time_of_day, t.label or "", 1 if t.is_prebuilt else 0)
                for t in req.times
            ]
            if hasattr(cursor, "executemany"):
                cursor.executemany("""
                    INSERT INTO notification_times (user_id, time_of_day, label, is_prebuilt)
                    VALUES (?, ?, ?, ?)
                """, time_params)
            else:
                for tp in time_params:
                    cursor.execute("""
                        INSERT INTO notification_times (user_id, time_of_day, label, is_prebuilt)
                        VALUES (?, ?, ?, ?)
                    """, tp)

    return {"status": "success", "message": "Notification preferences updated successfully"}

@router.post("/subscribe")
def subscribe_push(
    req: PushSubscriptionRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT id FROM notification_subscriptions WHERE endpoint = ?", (req.endpoint,))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE notification_subscriptions 
                SET user_id = ?, keys_p256dh = ?, keys_auth = ? 
                WHERE endpoint = ?
            """, (user_id, req.keys.p256dh, req.keys.auth, req.endpoint))
        else:
            cursor.execute("""
                INSERT INTO notification_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
                VALUES (?, ?, ?, ?)
            """, (user_id, req.endpoint, req.keys.p256dh, req.keys.auth))

    return {"status": "success", "message": "Push subscription registered"}

@router.post("/unsubscribe")
def unsubscribe_push(
    req: UnsubscribeRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    with get_db() as db:
        cursor = db.cursor()
        if req.endpoint:
            cursor.execute("DELETE FROM notification_subscriptions WHERE user_id = ? AND endpoint = ?", (user_id, req.endpoint))
        else:
            cursor.execute("DELETE FROM notification_subscriptions WHERE user_id = ?", (user_id,))

    return {"status": "success", "message": "Push subscription removed"}

@router.post("/test")
def send_test_notification(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT endpoint, keys_p256dh, keys_auth FROM notification_subscriptions WHERE user_id = ?", (user_id,))
        subs = cursor.fetchall()

    if not subs:
        raise HTTPException(
            status_code=400,
            detail="No active browser subscription found. Please toggle 'Daily Attendance Reminders' ON first to register this device."
        )

    test_payload = {
        "title": "Attendance Tracker Test 🔔",
        "body": "Daily attendance reminder notifications are working perfectly on this device!",
        "url": "/?tab=today",
        "tag": "test-reminder"
    }

    sent_count = 0
    errors = []
    for s in subs:
        success, code, msg = send_push_notification(dict(s), test_payload)
        if success:
            sent_count += 1
        else:
            errors.append(msg)

    if sent_count == 0:
        return {
            "status": "warning",
            "message": "Push notification could not be delivered to the registered browser endpoint.",
            "details": errors
        }

    return {
        "status": "success",
        "message": f"Test notification delivered successfully!"
    }

@router.api_route("/cron", methods=["GET", "POST"])
def run_cron_notifications(target_time: Optional[str] = Query(None)):
    """
    Automated endpoint invoked by Vercel Cron or external scheduler to dispatch reminders.
    """
    result = dispatch_scheduled_reminders(target_time_str=target_time)
    return {
        "status": "success",
        "execution": result
    }
