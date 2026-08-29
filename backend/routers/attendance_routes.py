import math
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

class MarkAttendanceItem(BaseModel):
    block_id: int
    status: str = Field(..., pattern="^(present|absent|holiday)$")

class MarkAttendanceRequest(BaseModel):
    log_date: str = Field(..., pattern="^\\d{4}-\\d{2}-\\d{2}$") # YYYY-MM-DD
    entries: List[MarkAttendanceItem]

def validate_edit_window(log_date_str: str):
    """
    Enforces server-side edit window:
    today - 7 days <= log_date <= today
    """
    try:
        log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
        
    today = date.today()
    min_date = today - timedelta(days=7)
    
    if log_date < min_date or log_date > today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Edit window violation: log_date {log_date_str} must be between {min_date.isoformat()} and {today.isoformat()} (within the last 7 days)."
        )
    return log_date

def calculate_bunk_stats(attended: int, total: int) -> dict:
    if total == 0:
        return {
            "percentage": 0.0,
            "is_below_threshold": False,
            "safe_to_miss": 0,
            "must_attend_next": 0
        }
        
    pct = round((attended / total) * 100, 2)
    is_below = pct < 75.0
    
    if pct >= 75.0:
        # safe_to_miss = floor(a / 0.75 - t)
        safe = math.floor((attended / 0.75) - total)
        return {
            "percentage": pct,
            "is_below_threshold": False,
            "safe_to_miss": max(0, safe),
            "must_attend_next": 0
        }
    else:
        # must_attend_next = ceil((0.75 * t - a) / 0.25)
        needed = math.ceil((0.75 * total - attended) / 0.25)
        return {
            "percentage": pct,
            "is_below_threshold": True,
            "safe_to_miss": 0,
            "must_attend_next": max(0, needed)
        }

@router.get("/logs")
def get_daily_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    today = date.today()
    
    if not start_date:
        start_date = (today - timedelta(days=30)).isoformat()
    if not end_date:
        end_date = (today + timedelta(days=7)).isoformat()
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT l.id, l.log_date, l.block_id, l.status, l.updated_at,
                   b.subject, b.periods, b.order_index, b.weekday
            FROM daily_logs l
            JOIN timetable_blocks b ON l.block_id = b.id
            WHERE l.user_id = ? AND l.log_date BETWEEN ? AND ?
            ORDER BY l.log_date, b.order_index
            """,
            (user_id, start_date, end_date)
        )
        rows = cursor.fetchall()
        
        # Group logs by date
        logs_by_date = {}
        for r in rows:
            d = r["log_date"]
            if d not in logs_by_date:
                logs_by_date[d] = []
            logs_by_date[d].append(dict(r))
            
        return {
            "start_date": start_date,
            "end_date": end_date,
            "logs": [dict(r) for r in rows],
            "logs_by_date": logs_by_date
        }

@router.post("/mark")
def mark_attendance(req: MarkAttendanceRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    section_id = current_user["section_id"]
    
    # 1. Enforce strict 7-day rule server-side
    validate_edit_window(req.log_date)
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify all block IDs belong to user's section
        for entry in req.entries:
            cursor.execute(
                "SELECT id, periods, subject FROM timetable_blocks WHERE id = ? AND section_id = ?",
                (entry.block_id, section_id)
            )
            block = cursor.fetchone()
            if not block:
                raise HTTPException(
                    status_code=400,
                    detail=f"Block ID {entry.block_id} does not belong to user's section."
                )
                
            cursor.execute(
                """
                INSERT INTO daily_logs (user_id, log_date, block_id, status, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, log_date, block_id) 
                DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, req.log_date, entry.block_id, entry.status)
            )
            
        return {"status": "success", "message": f"Saved {len(req.entries)} attendance entries for {req.log_date}."}

@router.get("/summary")
def get_attendance_summary(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    baseline_attended = current_user.get("baseline_attended") or 0
    baseline_total = current_user.get("baseline_total") or 0
    baseline_date = current_user.get("baseline_date")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Query all logged attendance for this user
        cursor.execute(
            """
            SELECT b.subject, b.periods, l.status, l.log_date
            FROM daily_logs l
            JOIN timetable_blocks b ON l.block_id = b.id
            WHERE l.user_id = ?
            """,
            (user_id,)
        )
        logs = cursor.fetchall()
        
        # Query distinct subjects from timetable
        cursor.execute(
            """
            SELECT DISTINCT subject
            FROM timetable_blocks
            WHERE section_id = ?
            ORDER BY subject
            """,
            (current_user["section_id"],)
        )
        all_subjects = [row["subject"] for row in cursor.fetchall()]
        
        # Aggregate subject-wise
        subject_stats: Dict[str, dict] = {
            s: {"attended": 0, "total": 0, "holiday_periods": 0} for s in all_subjects
        }
        
        logged_attended = 0
        logged_total = 0
        
        for row in logs:
            subj = row["subject"]
            periods = row["periods"]
            status = row["status"]
            
            if subj not in subject_stats:
                subject_stats[subj] = {"attended": 0, "total": 0, "holiday_periods": 0}
                
            if status == "present":
                subject_stats[subj]["attended"] += periods
                subject_stats[subj]["total"] += periods
                logged_attended += periods
                logged_total += periods
            elif status == "absent":
                subject_stats[subj]["total"] += periods
                logged_total += periods
            elif status == "holiday":
                subject_stats[subj]["holiday_periods"] += periods
                
        # Compute subject calculations
        subject_results = {}
        for subj, counts in subject_stats.items():
            bunk_info = calculate_bunk_stats(counts["attended"], counts["total"])
            subject_results[subj] = {
                "subject": subj,
                "attended": counts["attended"],
                "total": counts["total"],
                "holiday_periods": counts["holiday_periods"],
                **bunk_info
            }
            
        # Compute overall stats (including baseline)
        overall_attended = baseline_attended + logged_attended
        overall_total = baseline_total + logged_total
        overall_bunk_info = calculate_bunk_stats(overall_attended, overall_total)
        
        return {
            "overall": {
                "attended": overall_attended,
                "total": overall_total,
                "baseline_attended": baseline_attended,
                "baseline_total": baseline_total,
                "baseline_date": baseline_date,
                "logged_attended": logged_attended,
                "logged_total": logged_total,
                **overall_bunk_info
            },
            "subjects": subject_results
        }

@router.get("/forecast")
def forecast_attendance(
    target_date: str = Query(..., pattern="^\\d{4}-\\d{2}-\\d{2}$"),
    current_user: dict = Depends(get_current_user)
):
    """
    FAT (Forecast Attendance Tool):
    For any date within next 7 days, compute outcomes per block:
    'If absent -> % becomes X. If present -> % becomes Y.'
    """
    try:
        t_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
        
    today = date.today()
    # Ensure date is within forward 7 days
    if t_date < today or t_date > (today + timedelta(days=7)):
        raise HTTPException(
            status_code=400,
            detail=f"Forecast target_date {target_date} must be between today ({today.isoformat()}) and { (today + timedelta(days=7)).isoformat() }."
        )
        
    weekday = (t_date.weekday() + 1) % 7 # Python weekday: Mon=0..Sun=6 -> DB weekday: Sun=0..Sat=6
    
    if weekday == 0: # Sunday
        return {
            "target_date": target_date,
            "weekday": 0,
            "day_name": "Sunday",
            "is_holiday": True,
            "blocks": [],
            "message": "Sunday is a fixed holiday. No timetable blocks."
        }
        
    summary = get_attendance_summary(current_user)
    current_overall_att = summary["overall"]["attended"]
    current_overall_tot = summary["overall"]["total"]
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, weekday, order_index, subject, periods
            FROM timetable_blocks
            WHERE section_id = ? AND weekday = ?
            ORDER BY order_index
            """,
            (current_user["section_id"], weekday)
        )
        blocks = cursor.fetchall()
        
        forecast_blocks = []
        for b in blocks:
            subj = b["subject"]
            periods = b["periods"]
            
            subj_stat = summary["subjects"].get(subj, {"attended": 0, "total": 0})
            subj_att = subj_stat["attended"]
            subj_tot = subj_stat["total"]
            
            # Subject simulations
            subj_if_present = round(((subj_att + periods) / (subj_tot + periods)) * 100, 2) if (subj_tot + periods) > 0 else 0.0
            subj_if_absent = round((subj_att / (subj_tot + periods)) * 100, 2) if (subj_tot + periods) > 0 else 0.0
            
            # Overall simulations
            overall_if_present = round(((current_overall_att + periods) / (current_overall_tot + periods)) * 100, 2) if (current_overall_tot + periods) > 0 else 0.0
            overall_if_absent = round((current_overall_att / (current_overall_tot + periods)) * 100, 2) if (current_overall_tot + periods) > 0 else 0.0
            
            forecast_blocks.append({
                "block_id": b["id"],
                "subject": subj,
                "periods": periods,
                "order_index": b["order_index"],
                "current_subject_pct": subj_stat.get("percentage", 0.0),
                "subject_if_present": subj_if_present,
                "subject_if_absent": subj_if_absent,
                "current_overall_pct": summary["overall"]["percentage"],
                "overall_if_present": overall_if_present,
                "overall_if_absent": overall_if_absent
            })
            
        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return {
            "target_date": target_date,
            "weekday": weekday,
            "day_name": day_names[weekday],
            "is_holiday": False,
            "blocks": forecast_blocks
        }
