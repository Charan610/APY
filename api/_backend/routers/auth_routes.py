from fastapi import APIRouter, HTTPException, Depends, status, Header, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from database import get_db
from auth import (
    hash_pin, verify_pin, create_access_token, get_current_user,
    check_login_rate_limit, record_failed_attempt, clear_rate_limit,
    is_admin_user, record_login_session, touch_login_session,
    revoke_session_token, security
)

router = APIRouter(prefix="/auth", tags=["Auth"])

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

class ChangePinRequest(BaseModel):
    current_pin: str = Field(..., min_length=4, max_length=6)
    new_pin: str = Field(..., min_length=4, max_length=6)

    @field_validator("current_pin", "new_pin")
    @classmethod
    def validate_pin(cls, v: str):
        if not v.isdigit():
            raise ValueError("PIN must consist of digits only (4-6 digits)")
        return v

class TimetableBlockInput(BaseModel):
    weekday: int = Field(..., ge=1, le=6, description="1=Mon..6=Sat")
    order_index: int = Field(..., ge=1)
    subject: str = Field(..., min_length=1, max_length=100)
    periods: int = Field(..., ge=1, le=10)

class RegisterRequest(BaseModel):
    register_number: str = Field(..., min_length=3, max_length=20)
    pin: str = Field(..., min_length=4, max_length=6)
    platform: Optional[str] = "web"
    section_id: Optional[int] = None
    # For custom section onboarding
    custom_branch: Optional[str] = None
    custom_section_label: Optional[str] = None
    custom_effective_from: Optional[str] = "2026-07-20"
    custom_blocks: Optional[List[TimetableBlockInput]] = None
    # Optional baseline
    baseline_attended: Optional[int] = 0
    baseline_total: Optional[int] = 0
    baseline_date: Optional[str] = None
    # DPDP Act 2023 Explicit Consent
    dpdp_consent: bool = Field(True, description="Explicit consent under DPDP Act 2023 for academic attendance tracking")

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str):
        if not v.isdigit():
            raise ValueError("PIN must consist of digits only (4-6 digits)")
        return v

    @field_validator("register_number")
    @classmethod
    def validate_reg_no(cls, v: str):
        return v.strip().upper()

class LoginRequest(BaseModel):
    register_number: str
    pin: str
    platform: Optional[str] = "web"

    @field_validator("register_number")
    @classmethod
    def validate_reg_no(cls, v: str):
        return v.strip().upper()

class UpdateBaselineRequest(BaseModel):
    baseline_attended: int = Field(..., ge=0)
    baseline_total: int = Field(..., ge=0)
    baseline_date: Optional[str] = None
    section_id: Optional[int] = None

class UpdateSectionRequest(BaseModel):
    section_id: int

@router.post("/register")
def register(req: RegisterRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if user already exists
        cursor.execute("SELECT id FROM users WHERE register_number = ?", (req.register_number,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with register number {req.register_number} already exists"
            )

        section_id = req.section_id

        # If custom section is specified
        if not section_id:
            if not req.custom_branch or not req.custom_section_label:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please select an existing section or specify custom branch & section label"
                )
            
            branch = req.custom_branch.strip().upper()
            sec_label = req.custom_section_label.strip().upper()
            
            # Check if section already exists
            cursor.execute("SELECT id FROM sections WHERE branch = ? AND section_label = ?", (branch, sec_label))
            sec_row = cursor.fetchone()
            if sec_row:
                section_id = sec_row["id"]
            else:
                cursor.execute(
                    "INSERT INTO sections (branch, section_label, effective_from) VALUES (?, ?, ?)",
                    (branch, sec_label, req.custom_effective_from or "2026-07-20")
                )
                section_id = cursor.lastrowid
                
                # Insert custom blocks if provided
                if req.custom_blocks:
                    for blk in req.custom_blocks:
                        cursor.execute(
                            """
                            INSERT INTO timetable_blocks (section_id, weekday, order_index, subject, periods)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (section_id, blk.weekday, blk.order_index, blk.subject.strip(), blk.periods)
                        )
        else:
            # Verify section exists
            cursor.execute("SELECT id FROM sections WHERE id = ?", (section_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=400, detail="Invalid section selected")

        if req.baseline_total < req.baseline_attended:
            raise HTTPException(
                status_code=400,
                detail="Baseline total periods cannot be less than baseline attended periods"
            )

        if not req.dpdp_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="DPDP Act 2023 consent is required to process attendance data and create an account."
            )

        pin_hash = hash_pin(req.pin)
        cursor.execute(
            """
            INSERT INTO users (register_number, pin_hash, section_id, baseline_attended, baseline_total, baseline_date, consent_given_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (req.register_number, pin_hash, section_id, req.baseline_attended or 0, req.baseline_total or 0, req.baseline_date)
        )
        user_id = cursor.lastrowid

        cursor.execute(
            """
            SELECT s.branch, s.section_label 
            FROM sections s 
            WHERE s.id = ?
            """,
            (section_id,)
        )
        sec_info = cursor.fetchone()

        token = create_access_token({"sub": user_id, "reg": req.register_number})
        client_platform = req.platform or "web"
        record_login_session(user_id, client_platform, token, db_conn=conn)
        
        return {
            "token": token,
            "user": {
                "id": user_id,
                "register_number": req.register_number,
                "section_id": section_id,
                "branch": sec_info["branch"] if sec_info else "CSE",
                "section_label": sec_info["section_label"] if sec_info else "",
                "baseline_attended": req.baseline_attended or 0,
                "baseline_total": req.baseline_total or 0,
                "baseline_date": req.baseline_date,
                "is_admin": is_admin_user(req.register_number)
            }
        }

@router.post("/login")
def login(
    req: LoginRequest,
    request: Request,
    x_client_platform: Optional[str] = Header(None, alias="X-Client-Platform")
):
    client_ip = get_client_ip(request)
    check_login_rate_limit(req.register_number, client_ip)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT u.id, u.register_number, u.pin_hash, u.section_id, 
                   u.baseline_attended, u.baseline_total, u.baseline_date,
                   s.branch, s.section_label
            FROM users u
            JOIN sections s ON u.section_id = s.id
            WHERE u.register_number = ?
            """,
            (req.register_number,)
        )
        user = cursor.fetchone()
        
        if not user or not verify_pin(req.pin, user["pin_hash"]):
            record_failed_attempt(req.register_number, client_ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid register number or PIN"
            )
            
        clear_rate_limit(req.register_number)
        token = create_access_token({"sub": user["id"], "reg": user["register_number"]})
        
        client_platform = req.platform or x_client_platform or "web"
        record_login_session(user["id"], client_platform, token, db_conn=conn)

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "register_number": user["register_number"],
                "section_id": user["section_id"],
                "branch": user["branch"],
                "section_label": user["section_label"],
                "baseline_attended": user["baseline_attended"],
                "baseline_total": user["baseline_total"],
                "baseline_date": user["baseline_date"],
                "is_admin": is_admin_user(user["register_number"])
            }
        }

@router.get("/me")
def me(
    current_user: dict = Depends(get_current_user),
    x_client_platform: Optional[str] = Header(None, alias="X-Client-Platform")
):
    if x_client_platform:
        touch_login_session(current_user["id"], platform=x_client_platform)
    return {"user": current_user}

@router.put("/change-pin")
@router.post("/change-pin")
def change_pin(req: ChangePinRequest, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (current_user["id"],))
        row = cursor.fetchone()
        if not row or not verify_pin(req.current_pin, row["pin_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current PIN is incorrect"
            )
        
        new_hash = hash_pin(req.new_pin)
        cursor.execute("UPDATE users SET pin_hash = ? WHERE id = ?", (new_hash, current_user["id"]))
        return {"status": "success", "message": "PIN updated successfully"}

@router.put("/baseline")
def update_baseline(req: UpdateBaselineRequest, current_user: dict = Depends(get_current_user)):
    if req.baseline_total < req.baseline_attended:
        raise HTTPException(
            status_code=400,
            detail="Baseline total periods cannot be less than baseline attended periods"
        )
    with get_db() as conn:
        cursor = conn.cursor()
        if req.section_id:
            cursor.execute("SELECT id FROM sections WHERE id = ?", (req.section_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Section not found")
            cursor.execute(
                """
                UPDATE users 
                SET baseline_attended = ?, baseline_total = ?, baseline_date = ?, section_id = ?
                WHERE id = ?
                """,
                (req.baseline_attended, req.baseline_total, req.baseline_date, req.section_id, current_user["id"])
            )
        else:
            cursor.execute(
                """
                UPDATE users 
                SET baseline_attended = ?, baseline_total = ?, baseline_date = ?
                WHERE id = ?
                """,
                (req.baseline_attended, req.baseline_total, req.baseline_date, current_user["id"])
            )
        return {"status": "success", "message": "Baseline attendance and section updated"}

@router.put("/section")
def update_section(req: UpdateSectionRequest, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, branch, section_label FROM sections WHERE id = ?", (req.section_id,))
        sec = cursor.fetchone()
        if not sec:
            raise HTTPException(status_code=404, detail="Section not found")
            
        cursor.execute("UPDATE users SET section_id = ? WHERE id = ?", (req.section_id, current_user["id"]))
        return {
            "status": "success", 
            "message": f"Section updated to {sec['branch']} - {sec['section_label']}",
            "section": dict(sec)
        }

@router.post("/logout")
def logout(
    current_user: dict = Depends(get_current_user),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
):
    """Server-side session invalidation upon user logout."""
    if credentials and credentials.credentials:
        revoke_session_token(credentials.credentials)
    return {
        "status": "success",
        "message": "Successfully logged out. Session invalidated on server."
    }

@router.get("/my-data")
def get_my_data(current_user: dict = Depends(get_current_user)):
    """DPDP Act 2023 Right to Access: Provides full export of all personal & academic data stored."""
    user_id = current_user["id"]
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Full User record
        cursor.execute(
            """
            SELECT u.id, u.register_number, u.section_id, u.baseline_attended, 
                   u.baseline_total, u.baseline_date, u.created_at, u.consent_given_at,
                   s.branch, s.section_label, s.effective_from
            FROM users u
            JOIN sections s ON u.section_id = s.id
            WHERE u.id = ?
            """,
            (user_id,)
        )
        user_row = cursor.fetchone()

        # 2. Daily logs
        cursor.execute(
            """
            SELECT log_date, block_id, status, updated_at
            FROM daily_logs
            WHERE user_id = ?
            ORDER BY log_date DESC
            """,
            (user_id,)
        )
        logs = [dict(r) for r in cursor.fetchall()]

        # 3. Notification preferences & times
        cursor.execute("SELECT enabled, created_at, updated_at FROM notification_preferences WHERE user_id = ?", (user_id,))
        pref = cursor.fetchone()

        cursor.execute("SELECT time_of_day, label, is_prebuilt FROM notification_times WHERE user_id = ?", (user_id,))
        times = [dict(r) for r in cursor.fetchall()]

        # 4. Login sessions (anonymized)
        cursor.execute("SELECT platform, created_at, last_seen_at FROM login_sessions WHERE user_id = ?", (user_id,))
        sessions = [dict(r) for r in cursor.fetchall()]

        return {
            "dpdp_notice": "Personal data stored solely for calculating academic attendance under DPDP Act 2023.",
            "data_fiduciary_contact": "grievance@attendance.app",
            "profile": dict(user_row) if user_row else {},
            "daily_logs": logs,
            "daily_logs_count": len(logs),
            "notification_preferences": dict(pref) if pref else {"enabled": False},
            "notification_schedules": times,
            "login_sessions": sessions
        }

@router.delete("/account")
def delete_my_account(
    current_user: dict = Depends(get_current_user),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
):
    """DPDP Act 2023 Right to Erasure: Permanently removes the user and all associated attendance/log data."""
    user_id = current_user["id"]
    reg = current_user.get("register_number")
    with get_db() as conn:
        cursor = conn.cursor()
        # Non-destructive cascaded cleanup
        cursor.execute("DELETE FROM daily_logs WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM notification_times WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM notification_subscriptions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM notification_preferences WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM login_sessions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        
    if credentials and credentials.credentials:
        revoke_session_token(credentials.credentials)

    return {
        "status": "success",
        "message": f"Account for {reg} and all associated personal data have been permanently erased per DPDP Act 2023."
    }
