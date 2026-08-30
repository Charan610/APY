import math
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/attendance", tags=["Attendance"])

class MarkAttendanceItem(BaseModel):
    block_id: int
    status: str = Field(..., pattern="^(present|absent|holiday|unmarked)$")

class MarkAttendanceRequest(BaseModel):
    log_date: str = Field(..., pattern="^\\d{4}-\\d{2}-\\d{2}$") # YYYY-MM-DD
    entries: List[MarkAttendanceItem]

def validate_edit_window(log_date_str: str, baseline_date_str: Optional[str] = None):
    """
    Enforces server-side edit window:
    1. today - 7 days <= log_date <= today + 7 days (next Saturday/week)
    2. If baseline_date is set, log_date MUST be strictly > baseline_date
       (Dates on or before baseline_date are covered in historical baseline totals and locked).
    """
    try:
        log_date = datetime.strptime(log_date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
        
    today = date.today()
    min_date = today - timedelta(days=7)
    max_date = today + timedelta(days=7)
    
    if log_date < min_date or log_date > max_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Edit window violation: log_date {log_date_str} must be between {min_date.isoformat()} and {max_date.isoformat()}."
        )
        
    if baseline_date_str:
        try:
            b_date = datetime.strptime(baseline_date_str, "%Y-%m-%d").date()
            if log_date <= b_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Locked date: {log_date_str} is on or before baseline cutoff date ({baseline_date_str}) and is already included in baseline figures."
                )
        except ValueError:
            pass
            
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

def compute_summary_for_user(conn, current_user: dict) -> dict:
    user_id = current_user["id"]
    section_id = current_user.get("section_id") or 1
    baseline_attended = current_user.get("baseline_attended") or 0
    baseline_total = current_user.get("baseline_total") or 0
    baseline_date = current_user.get("baseline_date")
    
    cursor = conn.cursor()
    # High-performance DB-engine aggregation (GROUP BY subject)
    cursor.execute(
        """
        SELECT 
            b.subject,
            COALESCE(SUM(CASE WHEN l.status = 'present' THEN b.periods ELSE 0 END), 0) AS attended,
            COALESCE(SUM(CASE WHEN l.status IN ('present', 'absent') THEN b.periods ELSE 0 END), 0) AS total,
            COALESCE(SUM(CASE WHEN l.status = 'holiday' THEN b.periods ELSE 0 END), 0) AS holiday_periods
        FROM timetable_blocks b
        LEFT JOIN daily_logs l 
               ON b.id = l.block_id 
              AND l.user_id = ? 
              AND (l.log_date > ? OR ? IS NULL)
        WHERE b.section_id = ?
        GROUP BY b.subject
        ORDER BY b.subject
        """,
        (user_id, baseline_date, baseline_date, section_id)
    )
    rows = cursor.fetchall()
    
    subject_results = {}
    logged_attended = 0
    logged_total = 0
    
    for r in rows:
        subj = r["subject"]
        att = r["attended"]
        tot = r["total"]
        hol = r["holiday_periods"]
        
        logged_attended += att
        logged_total += tot
        bunk_info = calculate_bunk_stats(att, tot)
        subject_results[subj] = {
            "subject": subj,
            "attended": att,
            "total": tot,
            "holiday_periods": hol,
            **bunk_info
        }
        
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

@router.post("/mark")
def mark_attendance(req: MarkAttendanceRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    section_id = current_user["section_id"]
    
    # 1. Enforce strict 7-day rule & baseline cutoff date server-side
    validate_edit_window(req.log_date, current_user.get("baseline_date"))
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Verify all block IDs in a single batch query
        cursor.execute("SELECT id FROM timetable_blocks WHERE section_id = ?", (section_id,))
        valid_block_ids = {r["id"] for r in cursor.fetchall()}
        
        unmarked_entries = []
        active_entries = []
        
        for entry in req.entries:
            if entry.block_id not in valid_block_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Block ID {entry.block_id} does not belong to user's section."
                )
            if entry.status == "unmarked":
                unmarked_entries.append((user_id, req.log_date, entry.block_id))
            else:
                active_entries.append((user_id, req.log_date, entry.block_id, entry.status))
                
        # 2. Batch delete unmarked entries
        if unmarked_entries:
            if hasattr(cursor, "executemany"):
                cursor.executemany(
                    "DELETE FROM daily_logs WHERE user_id = ? AND log_date = ? AND block_id = ?",
                    unmarked_entries
                )
            else:
                for u in unmarked_entries:
                    cursor.execute(
                        "DELETE FROM daily_logs WHERE user_id = ? AND log_date = ? AND block_id = ?",
                        u
                    )
                    
        # 3. Batch upsert active entries
        if active_entries:
            upsert_sql = """
                INSERT INTO daily_logs (user_id, log_date, block_id, status, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, log_date, block_id) 
                DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
            """
            if hasattr(cursor, "executemany"):
                cursor.executemany(upsert_sql, active_entries)
            else:
                for a in active_entries:
                    cursor.execute(upsert_sql, a)
            
        # Return updated summary directly in response (eliminating 2nd HTTP roundtrip)
        fresh_summary = compute_summary_for_user(conn, current_user)
        return {
            "status": "success", 
            "message": f"Updated attendance entries for {req.log_date}.",
            "summary": fresh_summary
        }

@router.get("/summary")
def get_attendance_summary(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        return compute_summary_for_user(conn, current_user)

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
