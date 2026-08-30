import os
import json
import logging
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional
import pytz
from pywebpush import webpush, WebPushException
from py_vapid import Vapid
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

logger = logging.getLogger("notifications")
logger.setLevel(logging.INFO)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
VAPID_PEM_FILE = os.path.join(BACKEND_DIR, ".vapid_private.pem")
VAPID_PUB_FILE = os.path.join(BACKEND_DIR, ".vapid_public.txt")

# Default prebuilt times (IST)
PREBUILT_TIMES = [
    {"time_of_day": "09:00", "label": "Morning Check", "is_prebuilt": True},
    {"time_of_day": "12:00", "label": "Midday Check", "is_prebuilt": True},
    {"time_of_day": "16:30", "label": "End of Day Register", "is_prebuilt": True},
]

def load_or_generate_vapid_keys() -> tuple[str, str]:
    """
    Retrieves or generates persistent VAPID private PEM file and raw base64url public key.
    """
    env_priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    env_pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()

    if env_priv and env_pub:
        # If passed via environment, write to temporary/cached PEM file for pywebpush
        with open(VAPID_PEM_FILE, "w") as f:
            f.write(env_priv)
        with open(VAPID_PUB_FILE, "w") as f:
            f.write(env_pub)
        return VAPID_PEM_FILE, env_pub

    # Check local persistent files
    if os.path.exists(VAPID_PEM_FILE) and os.path.exists(VAPID_PUB_FILE):
        try:
            with open(VAPID_PUB_FILE, "r") as f:
                pub_key = f.read().strip()
            if pub_key:
                return VAPID_PEM_FILE, pub_key
        except Exception as e:
            logger.warning(f"Failed to read cached vapid files: {e}")

    # Generate fresh VAPID keypair
    vapid = Vapid()
    vapid.generate_keys()
    
    # Raw uncompressed EC point (65 bytes) -> base64url without padding
    raw_pub = vapid.public_key.public_bytes(
        encoding=Encoding.X962,
        format=PublicFormat.UncompressedPoint
    )
    public_key_b64 = base64.urlsafe_b64encode(raw_pub).rstrip(b'=').decode('utf-8')
    private_pem = vapid.private_pem().decode('utf-8')

    try:
        with open(VAPID_PEM_FILE, "w") as f:
            f.write(private_pem)
        with open(VAPID_PUB_FILE, "w") as f:
            f.write(public_key_b64)
    except Exception as e:
        logger.warning(f"Could not persist vapid keys: {e}")

    return VAPID_PEM_FILE, public_key_b64

VAPID_PRIVATE_PEM_PATH, VAPID_PUBLIC_KEY = load_or_generate_vapid_keys()
VAPID_CLAIMS = {"sub": "mailto:admin@attendance.app"}

def get_vapid_public_key() -> str:
    return VAPID_PUBLIC_KEY

def send_push_notification(subscription: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """
    Sends a single Web Push notification. Removes expired/revoked subscriptions (410/404).
    """
    sub_info = {
        "endpoint": subscription["endpoint"],
        "keys": {
            "p256dh": subscription["keys_p256dh"],
            "auth": subscription["keys_auth"]
        }
    }
    
    try:
        webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_PEM_PATH,
            vapid_claims=VAPID_CLAIMS,
            ttl=3600
        )
        return True
    except WebPushException as ex:
        status_code = getattr(ex.response, "status_code", None) if getattr(ex, "response", None) else None
        
        # 404 Not Found or 410 Gone means subscription is dead / revoked
        if status_code in (404, 410) or "410" in str(ex) or "404" in str(ex):
            logger.info(f"Removing dead subscription {subscription['endpoint']}")
            try:
                from database import get_db
                with get_db() as db:
                    cursor = db.cursor()
                    cursor.execute("DELETE FROM notification_subscriptions WHERE endpoint = ?", (subscription["endpoint"],))
            except Exception as e:
                logger.error(f"Error cleaning dead subscription: {e}")
        else:
            logger.warning(f"WebPush response warning: {ex}")
        return False
    except Exception as ex:
        logger.error(f"Unexpected push error: {ex}")
        return False

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
            # Select active users with matching notification time
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
                    success = send_push_notification(dict(sub), payload)
                    if success:
                        results["notifications_sent"] += 1
                    else:
                        results["failed"] += 1

    except Exception as e:
        logger.error(f"Error during reminder dispatch: {e}")
        results["error"] = str(e)

    return results
