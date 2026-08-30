from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/sections", tags=["Sections"])

class TimetableBlockItem(BaseModel):
    weekday: int = Field(..., ge=1, le=6, description="1=Mon..6=Sat")
    order_index: int = Field(..., ge=1)
    subject: str = Field(..., min_length=1, max_length=100)
    periods: int = Field(..., ge=1, le=10)

class CreateSectionRequest(BaseModel):
    branch: str = Field(..., min_length=1, max_length=50)
    section_label: str = Field(..., min_length=1, max_length=20)
    effective_from: Optional[str] = "2026-07-20"
    blocks: List[TimetableBlockItem]

class UpdateTimetableRequest(BaseModel):
    blocks: List[TimetableBlockItem]

@router.get("")
def list_sections():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.branch, s.section_label, s.effective_from, 
                   COUNT(b.id) as block_count,
                   SUM(b.periods) as weekly_periods
            FROM sections s
            LEFT JOIN timetable_blocks b ON s.id = b.section_id
            GROUP BY s.id
            ORDER BY s.branch, s.section_label
            """
        )
        rows = cursor.fetchall()
        return {"sections": [dict(r) for r in rows]}

@router.get("/{section_id}/timetable")
def get_section_timetable(section_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, branch, section_label, effective_from FROM sections WHERE id = ?", (section_id,))
        section = cursor.fetchone()
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
            
        cursor.execute(
            """
            SELECT id, weekday, order_index, subject, periods
            FROM timetable_blocks
            WHERE section_id = ?
            ORDER BY weekday, order_index
            """,
            (section_id,)
        )
        blocks = cursor.fetchall()
        
        # Organize by weekday (1..6)
        timetable_by_day = {i: [] for i in range(1, 7)}
        for blk in blocks:
            w = blk["weekday"]
            if w in timetable_by_day:
                timetable_by_day[w].append(dict(blk))
                
        return {
            "section": dict(section),
            "blocks": [dict(b) for b in blocks],
            "timetable_by_day": timetable_by_day
        }

@router.post("/create")
def create_section(req: CreateSectionRequest):
    branch = req.branch.strip().upper()
    sec_label = req.section_label.strip().upper()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sections WHERE branch = ? AND section_label = ?", (branch, sec_label))
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Section {branch} - {sec_label} already exists."
            )
            
        cursor.execute(
            "INSERT INTO sections (branch, section_label, effective_from) VALUES (?, ?, ?)",
            (branch, sec_label, req.effective_from or "2026-07-20")
        )
        section_id = cursor.lastrowid
        
        for blk in req.blocks:
            cursor.execute(
                """
                INSERT INTO timetable_blocks (section_id, weekday, order_index, subject, periods)
                VALUES (?, ?, ?, ?, ?)
                """,
                (section_id, blk.weekday, blk.order_index, blk.subject.strip(), blk.periods)
            )
            
        return {
            "status": "success",
            "section_id": section_id,
            "message": f"Section {branch} - {sec_label} created with {len(req.blocks)} blocks."
        }

@router.put("/{section_id}/timetable")
def update_section_timetable(section_id: int, req: UpdateTimetableRequest, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sections WHERE id = ?", (section_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Section not found")
            
        # Delete old blocks and replace with new
        cursor.execute("DELETE FROM timetable_blocks WHERE section_id = ?", (section_id,))
        for blk in req.blocks:
            cursor.execute(
                """
                INSERT INTO timetable_blocks (section_id, weekday, order_index, subject, periods)
                VALUES (?, ?, ?, ?, ?)
                """,
                (section_id, blk.weekday, blk.order_index, blk.subject.strip(), blk.periods)
            )
            
        return {"status": "success", "message": f"Timetable updated with {len(req.blocks)} blocks."}
