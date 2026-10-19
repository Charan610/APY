import os
os.environ.setdefault("VERCEL", "1")

from datetime import date, timedelta
from fastapi import HTTPException
from routers.attendance_routes import validate_edit_window, calculate_bunk_stats


def today():
    return date.today()


def test_valid_today_passes():
    d = validate_edit_window(today().isoformat())
    assert d == today()


def test_too_old_rejected():
    old = (today() - timedelta(days=8)).isoformat()
    try:
        validate_edit_window(old)
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400


def test_too_future_rejected():
    fut = (today() + timedelta(days=8)).isoformat()
    try:
        validate_edit_window(fut)
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400


def test_baseline_lock_rejected():
    d = (today() - timedelta(days=1)).isoformat()
    baseline = today().isoformat()
    try:
        validate_edit_window(d, baseline)
        assert False
    except HTTPException as e:
        assert e.status_code == 400


def test_baseline_older_allowed():
    d = (today() - timedelta(days=1)).isoformat()
    baseline = (today() - timedelta(days=7)).isoformat()
    assert validate_edit_window(d, baseline) is not None


def test_invalid_date_format():
    try:
        validate_edit_window("not-a-date")
        assert False
    except HTTPException as e:
        assert e.status_code == 400


def test_bunk_stats_above_threshold():
    out = calculate_bunk_stats(80, 100)
    assert out["percentage"] == 80.0
    assert out["is_below_threshold"] is False
    assert out["safe_to_miss"] >= 0


def test_bunk_stats_below_threshold():
    out = calculate_bunk_stats(70, 100)
    assert out["is_below_threshold"] is True
    assert out["must_attend_next"] > 0
