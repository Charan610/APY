import secrets
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field, field_validator
from database import get_db
from auth import hash_pin, get_current_admin_user

router = APIRouter(prefix="/admin", tags=["Admin"])

class ResetPinRequest(BaseModel):
    target_register_number: str = Field(..., min_length=3, max_length=20)

    @field_validator("target_register_number")
    @classmethod
    def validate_reg_no(cls, v: str):
        return v.strip().upper()

@router.get("/search")
def search_student(
    register_number: str = Query(..., min_length=2, description="Student register number to search"),
    admin_user: dict = Depends(get_current_admin_user)
):
    reg_clean = register_number.strip().upper()
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
    admin_user: dict = Depends(get_current_admin_user)
):
    target_reg = req.target_register_number
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

        # Generate secure random 6-digit PIN
        new_pin = f"{secrets.randbelow(1000000):06d}"
        new_pin_hash = hash_pin(new_pin)

        # Overwrite only the pin_hash column
        cursor.execute(
            "UPDATE users SET pin_hash = ? WHERE id = ?",
            (new_pin_hash, student["id"])
        )

        # Log action in pin_reset_log
        admin_reg = admin_user.get("register_number", "ADMIN")
        cursor.execute(
            """
            INSERT INTO pin_reset_log (target_register_number, reset_by_register_number)
            VALUES (?, ?)
            """,
            (target_reg, admin_reg)
        )

        return {
            "status": "success",
            "target_register_number": target_reg,
            "branch": student["branch"],
            "section_label": student["section_label"],
            "new_pin": new_pin,
            "message": f"Temporary PIN generated for {target_reg}. Relay this PIN securely to the student."
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
