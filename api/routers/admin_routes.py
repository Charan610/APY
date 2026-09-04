import secrets
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status, Query, Request
from pydantic import BaseModel, Field, field_validator
from database import get_db, log_admin_action
from auth import hash_pin, get_current_admin_user, check_admin_reset_rate_limit

router = APIRouter(prefix="/admin", tags=["Admin"])

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

class ResetPinRequest(BaseModel):
    target_register_number: str = Field(..., min_length=3, max_length=20)
    custom_pin: Optional[str] = None

    @field_validator("target_register_number")
    @classmethod
    def validate_reg_no(cls, v: str):
        return v.strip().upper()

    @field_validator("custom_pin")
    @classmethod
    def validate_custom_pin(cls, v: Optional[str]):
        if v is not None and v.strip():
            clean = v.strip()
            if not clean.isdigit() or len(clean) < 4 or len(clean) > 6:
                raise ValueError("Custom PIN must be 4 to 6 numeric digits.")
            return clean
        return None

@router.get("/users")
def get_admin_users(
    request: Request,
    limit: int = Query(200, ge=1, le=1000),
    admin_user: dict = Depends(get_current_admin_user)
):
    admin_reg = admin_user.get("register_number", "ADMIN")
    client_ip = get_client_ip(request)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT 
                u.id, 
                u.register_number, 
                COALESCE(s.branch, 'CSE') as branch, 
                COALESCE(s.section_label, '?') as section_label,
                u.baseline_attended, 
                u.baseline_total, 
                u.baseline_date,
                u.created_at,
                COUNT(d.id) as logged_periods
            FROM users u
            LEFT JOIN sections s ON u.section_id = s.id
            LEFT JOIN daily_logs d ON u.id = d.user_id
            GROUP BY u.id
            ORDER BY u.register_number ASC
            LIMIT ?
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        
        users_list = []
        for r in rows:
            u_dict = dict(r)
            try:
                cursor.execute(
                    """
                    SELECT platform, last_seen_at
                    FROM login_sessions
                    WHERE user_id = ?
                    ORDER BY last_seen_at DESC
                    LIMIT 1
                    """,
                    (u_dict["id"],)
                )
                sess = cursor.fetchone()
                if sess:
                    u_dict["last_seen_at"] = sess["last_seen_at"]
                    u_dict["last_platform"] = sess["platform"]
                else:
                    u_dict["last_seen_at"] = None
                    u_dict["last_platform"] = None
            except Exception:
                u_dict["last_seen_at"] = None
                u_dict["last_platform"] = None
            users_list.append(u_dict)

        log_admin_action(
            admin_reg=admin_reg,
            action="VIEW_ALL_USERS",
            details=f"Retrieved {len(users_list)} registered users",
            ip_address=client_ip,
            db_conn=conn
        )
            
        return {
            "users": users_list,
            "count": len(users_list)
        }

@router.get("/search")
def search_student(
    request: Request,
    register_number: str = Query(..., min_length=2, description="Student register number to search"),
    admin_user: dict = Depends(get_current_admin_user)
):
    reg_clean = register_number.strip().upper()
    admin_reg = admin_user.get("register_number", "ADMIN")
    client_ip = get_client_ip(request)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT 
                u.id, 
                u.register_number, 
                COALESCE(s.branch, 'CSE') as branch, 
                COALESCE(s.section_label, '?') as section_label,
                u.baseline_attended, 
                u.baseline_total, 
                u.baseline_date,
                u.created_at,
                COUNT(d.id) as logged_periods
            FROM users u
            LEFT JOIN sections s ON u.section_id = s.id
            LEFT JOIN daily_logs d ON u.id = d.user_id
            WHERE u.register_number = ?
            GROUP BY u.id
            """,
            (reg_clean,)
        )
        row = cursor.fetchone()

        def enrich_user_with_sessions(user_dict):
            if not user_dict or "id" not in user_dict:
                return user_dict
            try:
                cursor.execute(
                    """
                    SELECT platform, created_at, last_seen_at
                    FROM login_sessions
                    WHERE user_id = ?
                    ORDER BY last_seen_at DESC
                    LIMIT 5
                    """,
                    (user_dict["id"],)
                )
                sessions = [dict(s) for s in cursor.fetchall()]
                platforms = list(dict.fromkeys([s["platform"] for s in sessions]))
                user_dict["platforms"] = platforms
                user_dict["recent_sessions"] = sessions
            except Exception:
                user_dict["platforms"] = []
                user_dict["recent_sessions"] = []
            return user_dict

        log_admin_action(
            admin_reg=admin_reg,
            action="SEARCH_STUDENT",
            target=reg_clean,
            details=f"Searched student {reg_clean}",
            ip_address=client_ip,
            db_conn=conn
        )

        if not row:
            # Also attempt prefix search if exact match not found
            cursor.execute(
                """
                SELECT 
                    u.id, 
                    u.register_number, 
                    COALESCE(s.branch, 'CSE') as branch, 
                    COALESCE(s.section_label, '?') as section_label,
                    u.baseline_attended, 
                    u.baseline_total, 
                    u.baseline_date,
                    u.created_at,
                    COUNT(d.id) as logged_periods
                FROM users u
                LEFT JOIN sections s ON u.section_id = s.id
                LEFT JOIN daily_logs d ON u.id = d.user_id
                WHERE u.register_number LIKE ?
                GROUP BY u.id
                ORDER BY u.register_number ASC
                LIMIT 10
                """,
                (f"%{reg_clean}%",)
            )
            matches = cursor.fetchall()
            enriched_matches = [enrich_user_with_sessions(dict(m)) for m in matches] if matches else []
            return {
                "exact_match": None,
                "matches": enriched_matches,
                "count": len(enriched_matches)
            }

        exact_dict = enrich_user_with_sessions(dict(row))
        return {
            "exact_match": exact_dict,
            "matches": [exact_dict],
            "count": 1
        }

@router.post("/reset-pin")
def reset_student_pin(
    req: ResetPinRequest,
    request: Request,
    admin_user: dict = Depends(get_current_admin_user)
):
    target_reg = req.target_register_number
    admin_reg = admin_user.get("register_number", "ADMIN")
    client_ip = get_client_ip(request)

    # Security: Rate limit admin resets per admin & per IP
    check_admin_reset_rate_limit(admin_reg, client_ip)

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify student exists
        cursor.execute(
            """
            SELECT u.id, u.register_number, COALESCE(s.branch, 'CSE') as branch, COALESCE(s.section_label, '?') as section_label
            FROM users u
            LEFT JOIN sections s ON u.section_id = s.id
            WHERE u.register_number = ?
            """,
            (target_reg,)
        )
        student = cursor.fetchone()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student with register number {target_reg} was not found"
            )

        # Generate secure PIN or use custom PIN
        if req.custom_pin:
            new_pin = req.custom_pin
        else:
            new_pin = f"{secrets.randbelow(1000000):06d}"
        new_pin_hash = hash_pin(new_pin)

        # Overwrite only the pin_hash column
        cursor.execute(
            "UPDATE users SET pin_hash = ? WHERE id = ?",
            (new_pin_hash, student["id"])
        )

        # Log action in pin_reset_log
        cursor.execute(
            """
            INSERT INTO pin_reset_log (target_register_number, reset_by_register_number)
            VALUES (?, ?)
            """,
            (target_reg, admin_reg)
        )

        # Log action in comprehensive admin_audit_logs (NEVER storing raw PIN)
        log_admin_action(
            admin_reg=admin_reg,
            action="RESET_PIN",
            target=target_reg,
            details=f"PIN reset successfully ({'custom' if req.custom_pin else 'random'} 6-digit)",
            ip_address=client_ip,
            db_conn=conn
        )

        return {
            "status": "success",
            "target_register_number": target_reg,
            "branch": student["branch"],
            "section_label": student["section_label"],
            "new_pin": new_pin,
            "message": f"PIN successfully set for {target_reg}. Relay this PIN securely to the student."
        }

@router.get("/reset-logs")
def get_reset_logs(
    limit: int = Query(25, ge=1, le=100),
    admin_user: dict = Depends(get_current_admin_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, target_register_number, reset_by_register_number, reset_at
            FROM pin_reset_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        return {
            "logs": [dict(r) for r in rows] if rows else []
        }

@router.get("/audit-logs")
def get_admin_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    admin_user: dict = Depends(get_current_admin_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, admin_register_number, action, target, details, ip_address, created_at
            FROM admin_audit_logs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        return {
            "logs": [dict(r) for r in rows] if rows else []
        }

@router.get("/platform-stats")
def get_platform_stats(admin_user: dict = Depends(get_current_admin_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Total sessions by platform
        cursor.execute("SELECT platform, COUNT(*) FROM login_sessions GROUP BY platform")
        sessions_by_platform = {r[0]: r[1] for r in cursor.fetchall()}
        
        # 2. Unique users by platform
        cursor.execute("SELECT platform, COUNT(DISTINCT user_id) FROM login_sessions GROUP BY platform")
        unique_by_platform = {r[0]: r[1] for r in cursor.fetchall()}
        
        # 3. Android only users
        cursor.execute("""
            SELECT u.register_number, MAX(s.last_seen_at) as last_seen
            FROM users u
            JOIN login_sessions s ON u.id = s.user_id
            WHERE s.platform = 'android'
            AND u.id NOT IN (
                SELECT user_id FROM login_sessions WHERE platform = 'web'
            )
            GROUP BY u.id
            ORDER BY last_seen DESC
        """)
        android_only = [dict(r) for r in cursor.fetchall()]
        
        # 4. Web only users
        cursor.execute("""
            SELECT u.register_number, MAX(s.last_seen_at) as last_seen
            FROM users u
            JOIN login_sessions s ON u.id = s.user_id
            WHERE s.platform = 'web'
            AND u.id NOT IN (
                SELECT user_id FROM login_sessions WHERE platform = 'android'
            )
            GROUP BY u.id
            ORDER BY last_seen DESC
        """)
        web_only = [dict(r) for r in cursor.fetchall()]
        
        # 5. Dual users (both Web and Android)
        cursor.execute("""
            SELECT u.register_number, MAX(s.last_seen_at) as last_seen
            FROM users u
            WHERE u.id IN (SELECT user_id FROM login_sessions WHERE platform = 'android')
            AND u.id IN (SELECT user_id FROM login_sessions WHERE platform = 'web')
            GROUP BY u.id
            ORDER BY last_seen DESC
        """)
        dual_users = [dict(r) for r in cursor.fetchall()]
        
        return {
            "sessions": {
                "android": sessions_by_platform.get("android", 0),
                "web": sessions_by_platform.get("web", 0),
                "ios": sessions_by_platform.get("ios", 0),
                "total": sum(sessions_by_platform.values())
            },
            "unique_users": {
                "android": unique_by_platform.get("android", 0),
                "web": unique_by_platform.get("web", 0),
                "android_only_count": len(android_only),
                "web_only_count": len(web_only),
                "dual_count": len(dual_users)
            },
            "android_only_students": android_only,
            "web_only_students": web_only,
            "dual_students": dual_users
        }
