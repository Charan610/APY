import os
import json
import logging
import base64
import tempfile
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import pytz
from pywebpush import webpush, WebPushException

logger = logging.getLogger("notifications")
logger.setLevel(logging.INFO)

# Default static VAPID keypair (P-256 EC curve)
DEFAULT_VAPID_PUBLIC_KEY = "BLdBuap05j2Ls54TSUHrONWcfH9w7Rn-VmEMsPbN8dkOypzaq9ywAuvPOWw-1babe9v0PirCdhFXADO7mehmKsE"
DEFAULT_VAPID_PRIVATE_PEM = """-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglOx7tbFpzTrY/XXP
9uAt28K5bcUBXcEvXsnE3OCz8WWhRANCAAS3QbmqdOY9i7OeE0lB6zjVnHx/cO0Z
/lZhDLD2zfHZDsqc2qvcsALrzzlsPtW2m3vb9D4qwnYRVwAzu5noZirB
-----END PRIVATE KEY-----""".strip()

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip() or DEFAULT_VAPID_PUBLIC_KEY
VAPID_PRIVATE_PEM = os.environ.get("VAPID_PRIVATE_KEY", "").strip() or DEFAULT_VAPID_PRIVATE_PEM

# Write PEM to temporary directory (always writable on Vercel Serverless and OS)
TEMP_DIR = tempfile.gettempdir()
VAPID_PEM_PATH = os.path.join(TEMP_DIR, "apy_vapid_private.pem")
try:
    with open(VAPID_PEM_PATH, "w") as f:
        f.write(VAPID_PRIVATE_PEM)
except Exception as e:
    logger.warning(f"Could not write temp VAPID PEM: {e}")

VAPID_CLAIMS = {"sub": "mailto:admin@attendance.app"}

# Default prebuilt times (IST)
PREBUILT_TIMES = [
    {"time_of_day": "09:00", "label": "Morning Check", "is_prebuilt": True},
    {"time_of_day": "12:00", "label": "Midday Check", "is_prebuilt": True},
    {"time_of_day": "16:30", "label": "End of Day Register", "is_prebuilt": True},
]

def get_vapid_public_key() -> str:
    return VAPID_PUBLIC_KEY

def send_push_notification(subscription: Dict[str, Any], payload: Dict[str, Any]) -> Tuple[bool, Optional[int], str]:
    """
    Sends a Web Push notification to a browser subscription.
    Automatically logs push service response and cleans up HTTP 404 / 410 expired endpoints.
    Returns: (success: bool, status_code: Optional[int], message: str)
    """
    sub_info = {
        "endpoint": subscription["endpoint"],
        "keys": {
            "p256dh": subscription["keys_p256dh"],
            "auth": subscription["keys_auth"]
        }
    }
    
    try:
        resp = webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PEM_PATH if os.path.exists(VAPID_PEM_PATH) else VAPID_PRIVATE_PEM,
            vapid_claims=VAPID_CLAIMS,
            ttl=3600
        )
        status_code = resp.status_code if resp else 201
        logger.info(f"[WebPush] Successfully delivered push to {subscription['endpoint'][:40]}... (Status: {status_code})")
        return (True, status_code, "Delivered successfully")
    except WebPushException as ex:
        status_code = getattr(ex.response, "status_code", None) if getattr(ex, "response", None) else None
        body_text = ex.response.text if (getattr(ex, "response", None) and hasattr(ex.response, "text")) else str(ex)
        
        logger.warning(f"[WebPush] Push delivery failed. Status: {status_code}, Body: {body_text}")
        
        # 404 Not Found or 410 Gone means subscription is dead / revoked
        if status_code in (404, 410) or "410" in str(ex) or "404" in str(ex):
            logger.info(f"[WebPush] Pruning expired subscription {subscription['endpoint']}")
            try:
                from database import get_db
                with get_db() as db:
                    cursor = db.cursor()
                    cursor.execute("DELETE FROM notification_subscriptions WHERE endpoint = ?", (subscription["endpoint"],))
            except Exception as e:
                logger.error(f"[WebPush] Error cleaning dead subscription: {e}")
            return (False, status_code or 410, "Push subscription expired or was revoked in browser.")
        
        return (False, status_code, f"Push service error ({status_code}): {body_text}")
    except Exception as ex:
        logger.error(f"[WebPush] Unexpected push error: {type(ex).__name__} - {ex}")
        return (False, None, str(ex))

def dispatch_scheduled_reminders(target_time_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Finds all users whose reminder time matches current IST time and sends them reminders.
    """
    from database import get_db
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    
    if not target_time_str:
        target_time_str = now_ist.strftime("%H:%M")
        
    logger.info(f"Checking attendance reminders for IST time: {target_time_str}")

    results = {
        "time": target_time_str,
        "matched_users": 0,
        "notifications_sent": 0,
        "failed": 0
    }

    payload = {
        "title": "Attendance Register Reminder ⏰",
        "body": "Time to mark today's attendance in your register!",
        "url": "/?tab=today",
        "timestamp": int(now_ist.timestamp() * 1000)
    }

    try:
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute("""
                SELECT DISTINCT u.id as user_id, u.register_number, nt.time_of_day, nt.label
                FROM notification_times nt
                JOIN notification_preferences np ON nt.user_id = np.user_id
                JOIN users u ON nt.user_id = u.id
                WHERE np.enabled = 1 AND nt.time_of_day = ?
            """, (target_time_str,))
            users = cursor.fetchall()
            results["matched_users"] = len(users)

            for user in users:
                cursor.execute("""
                    SELECT id, user_id, endpoint, keys_p256dh, keys_auth
                    FROM notification_subscriptions
                    WHERE user_id = ?
                """, (user["user_id"],))
                subs = cursor.fetchall()

                for sub in subs:
                    success, code, msg = send_push_notification(dict(sub), payload)
                    if success:
                        results["notifications_sent"] += 1
                    else:
                        results["failed"] += 1

    except Exception as e:
        logger.error(f"Error during reminder dispatch: {e}")
        results["error"] = str(e)

    return results
