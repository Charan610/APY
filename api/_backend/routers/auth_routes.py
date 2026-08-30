from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from database import get_db
from auth import hash_pin, verify_pin, create_access_token, get_current_user, check_rate_limit, record_failed_attempt, clear_rate_limit

router = APIRouter(prefix="/auth", tags=["Auth"])

class TimetableBlockInput(BaseModel):
    weekday: int = Field(..., ge=1, le=6, description="1=Mon..6=Sat")
    order_index: int = Field(..., ge=1)
    subject: str = Field(..., min_length=1, max_length=100)
    periods: int = Field(..., ge=1, le=10)

class RegisterRequest(BaseModel):
    register_number: str = Field(..., min_length=3, max_length=20)
    pin: str = Field(..., min_length=4, max_length=6)
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

        pin_hash = hash_pin(req.pin)
        cursor.execute(
            """
            INSERT INTO users (register_number, pin_hash, section_id, baseline_attended, baseline_total, baseline_date)
            VALUES (?, ?, ?, ?, ?, ?)
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
                "baseline_date": req.baseline_date
            }
        }

@router.post("/login")
def login(req: LoginRequest):
    check_rate_limit(req.register_number)
    
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
            record_failed_attempt(req.register_number)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid register number or PIN"
            )
            
        clear_rate_limit(req.register_number)
        token = create_access_token({"sub": user["id"], "reg": user["register_number"]})
        
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
                "baseline_date": user["baseline_date"]
            }
        }

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}

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
