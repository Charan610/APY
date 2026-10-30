"""Exercise extra-class storage and calculations against an isolated SQLite DB."""
import csv
import io
import os
from datetime import date, timedelta

os.environ.setdefault("VERCEL", "1")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import database
from auth import get_current_user
from routers.attendance_routes import router
from routers.auth_routes import router as auth_router


@pytest.fixture
def attendance(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "attendance.db"))
    monkeypatch.setattr(database, "TURSO_DATABASE_URL", "")
    monkeypatch.setattr(database, "TURSO_AUTH_TOKEN", "")
    monkeypatch.setattr(database, "_local_schema_initialized", True)
    # Migration must work on existing databases as well as newly seeded ones.
    if hasattr(database, "_extra_classes_schema_initialized"):
        monkeypatch.setattr(database, "_extra_classes_schema_initialized", False)
    database.init_db()
    with database.get_db() as conn:
        conn.execute("INSERT INTO sections (id, branch, section_label, effective_from) VALUES (1, 'CSE', 'A', '2026-01-01')")
        for user_id in (1, 2):
            conn.execute("INSERT INTO users (id, register_number, pin_hash, section_id, baseline_attended, baseline_total, baseline_date) VALUES (?, ?, 'unused', 1, 6, 10, '2026-01-01')", (user_id, f"TEST{user_id}"))
        conn.execute("INSERT INTO timetable_blocks (id, section_id, weekday, order_index, subject, periods) VALUES (1, 1, 5, 1, 'DBMS', 2)")
        conn.execute("INSERT INTO daily_logs (user_id, log_date, block_id, status) VALUES (1, '2026-10-30', 1, 'present')")
    user = {"id": 1, "register_number": "TEST1", "section_id": 1, "baseline_attended": 6, "baseline_total": 10, "baseline_date": "2026-01-01"}
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        yield client, user


def add(client, **overrides):
    payload = {"log_date": "2026-10-30", "subject": "DBMS", "periods": 2, "session": "afternoon", "status": "unmarked"}
    payload.update(overrides)
    return client.post("/api/attendance/extra-classes", json=payload)


def test_planned_class_persists_without_counting_attendance(attendance):
    client, _ = attendance
    response = add(client, subject=" dbms ")
    assert response.status_code == 200
    saved = response.json()["extra_class"]
    assert saved["subject"] == "DBMS"
    assert saved["session"] == "afternoon"
    assert saved["status"] == "unmarked"
    assert response.json()["summary"]["overall"]["attended"] == 8
    assert response.json()["summary"]["overall"]["total"] == 12
    result = client.get("/api/attendance/extra-classes?start_date=2026-10-30&end_date=2026-10-30").json()
    assert [entry["id"] for entry in result["extra_classes_by_date"]["2026-10-30"]] == [saved["id"]]


def test_multiple_classes_merge_existing_subject_and_custom_subject(attendance):
    client, _ = attendance
    assert add(client, subject="dbms", status="present", periods=3).status_code == 200
    result = add(client, subject="Guest Lecture", status="absent", periods=2).json()
    assert result["summary"]["overall"]["attended"] == 11
    assert result["summary"]["overall"]["total"] == 17
    assert result["summary"]["subjects"]["DBMS"]["attended"] == 5
    assert result["summary"]["subjects"]["DBMS"]["total"] == 5
    assert result["summary"]["subjects"]["Guest Lecture"]["total"] == 2


def test_mark_edit_unmark_and_delete_preserve_regular_attendance(attendance):
    client, _ = attendance
    response = add(client)
    assert response.status_code == 200
    extra_id = response.json()["extra_class"]["id"]
    path = f"/api/attendance/extra-classes/{extra_id}"
    payload = {"subject": "DBMS", "periods": 3, "session": "morning", "status": "present"}
    result = client.put(path, json=payload)
    assert result.status_code == 200
    assert result.json()["summary"]["overall"]["attended"] == 11
    payload["status"] = "absent"
    result = client.put(path, json=payload).json()
    assert result["summary"]["overall"]["attended"] == 8
    assert result["summary"]["overall"]["total"] == 15
    payload["status"] = "unmarked"
    assert client.put(path, json=payload).json()["summary"]["overall"]["total"] == 12
    assert client.delete(path).json()["summary"]["overall"]["total"] == 12
    assert client.delete(path).status_code == 404
    assert len(client.get("/api/attendance/logs?start_date=2026-10-30&end_date=2026-10-30").json()["logs"]) == 1


def test_extra_classes_are_private_to_owner(attendance):
    client, user = attendance
    response = add(client)
    assert response.status_code == 200
    extra_id = response.json()["extra_class"]["id"]
    user["id"] = 2
    result = client.get("/api/attendance/extra-classes?start_date=2026-10-30&end_date=2026-10-30")
    assert result.json()["extra_classes"] == []
    assert client.put(f"/api/attendance/extra-classes/{extra_id}", json={"subject": "DBMS", "periods": 1, "session": "morning", "status": "present"}).status_code == 404
    assert client.delete(f"/api/attendance/extra-classes/{extra_id}").status_code == 404
    user["id"] = 1
    assert len(client.get("/api/attendance/extra-classes?start_date=2026-10-30&end_date=2026-10-30").json()["extra_classes"]) == 1


@pytest.mark.parametrize("log_date", ["2026-03-01", "2027-06-01", "2026-11-01"])
def test_any_post_baseline_date_including_sunday_is_supported(attendance, log_date):
    client, _ = attendance
    assert add(client, log_date=log_date).status_code == 200


@pytest.mark.parametrize("log_date", ["2026-01-01", "2025-12-31", "2026-02-30", "bad-date"])
def test_baseline_and_invalid_dates_are_rejected(attendance, log_date):
    client, _ = attendance
    assert add(client, log_date=log_date).status_code in (400, 422)


@pytest.mark.parametrize("override", [{"periods": 0}, {"periods": 11}, {"periods": 1.5}, {"periods": True}, {"subject": "   "}, {"status": "invalid"}, {"session": "night"}])
def test_invalid_class_details_are_rejected(attendance, override):
    client, _ = attendance
    assert add(client, **override).status_code == 422


def test_new_baseline_locks_existing_extras_and_excludes_their_totals(attendance):
    client, user = attendance
    response = add(client, status="present")
    assert response.status_code == 200
    extra_id = response.json()["extra_class"]["id"]
    user["baseline_date"] = "2026-10-30"
    assert client.delete(f"/api/attendance/extra-classes/{extra_id}").status_code == 400
    assert client.put(f"/api/attendance/extra-classes/{extra_id}", json={"subject": "DBMS", "periods": 2, "session": "afternoon", "status": "absent"}).status_code == 400
    assert client.get("/api/attendance/summary").json()["overall"]["total"] == 10


def test_export_includes_extra_class_without_changing_regular_rows(attendance):
    client, _ = attendance
    assert add(client, subject="Guest Lecture", status="present", periods=3).status_code == 200
    rows = list(csv.DictReader(io.StringIO(client.get("/api/attendance/export-csv").text)))
    assert len(rows) == 2
    assert {r["Subject"] for r in rows} == {"DBMS", "Guest Lecture"}
    assert next(r for r in rows if r["Subject"] == "Guest Lecture")["Periods"] == "3"


def test_sunday_forecast_includes_extra_and_does_not_double_count_marked_periods(attendance):
    client, _ = attendance
    today = date.today()
    sunday = today + timedelta(days=(6 - today.weekday()) % 7)
    response = add(client, log_date=sunday.isoformat(), subject="Guest Lecture", periods=2, status="present")
    assert response.status_code == 200
    forecast = client.get(f"/api/attendance/forecast?target_date={sunday.isoformat()}").json()
    assert forecast["is_holiday"] is False
    assert len(forecast["blocks"]) == 1
    block = forecast["blocks"][0]
    assert block["is_extra"] is True
    assert block["overall_if_present"] == 71.43  # 10/14, not 12/16
    assert block["overall_if_absent"] == 57.14  # 8/14


def test_reversed_or_malformed_list_ranges_are_rejected(attendance):
    client, _ = attendance
    for query in ("start_date=2026-10-31&end_date=2026-10-01", "start_date=bad-date&end_date=2026-10-30"):
        assert client.get(f"/api/attendance/extra-classes?{query}").status_code in (400, 422)


def test_holiday_extra_excludes_periods_from_attendance(attendance):
    client, _ = attendance
    result = add(client, status='holiday', periods=4)
    assert result.status_code == 200
    assert result.json()['summary']['overall']['total'] == 12
    assert result.json()['summary']['subjects']['DBMS']['holiday_periods'] == 4


def test_regular_attendance_save_preserves_extra_class(attendance, monkeypatch):
    client, _ = attendance
    monkeypatch.setattr('routers.attendance_routes.get_today_ist', lambda: date(2026, 10, 30))
    assert add(client, status='present', periods=3).status_code == 200
    result = client.post('/api/attendance/mark', json={'log_date': '2026-10-30', 'entries': [{'block_id': 1, 'status': 'absent'}]})
    assert result.status_code == 200
    assert result.json()['summary']['overall']['attended'] == 9
    assert result.json()['summary']['overall']['total'] == 15
    assert len(client.get('/api/attendance/extra-classes?start_date=2026-10-30&end_date=2026-10-30').json()['extra_classes']) == 1


def test_existing_database_migrates_without_losing_regular_attendance(attendance, monkeypatch):
    client, _ = attendance
    with database.get_db() as conn:
        conn.execute('DROP TABLE extra_classes')
    monkeypatch.setattr(database, '_extra_classes_schema_initialized', False)
    result = client.get('/api/attendance/summary')
    assert result.status_code == 200
    assert result.json()['overall']['attended'] == 8
    assert add(client).status_code == 200


def test_extra_class_endpoints_require_authentication(attendance):
    client, _ = attendance
    client.app.dependency_overrides.clear()
    assert client.get('/api/attendance/extra-classes').status_code == 401
    assert add(client).status_code == 401
    assert client.delete('/api/attendance/extra-classes/1').status_code == 401


def test_target_projection_uses_planned_extra_periods(attendance, monkeypatch):
    client, _ = attendance
    monkeypatch.setattr('routers.attendance_routes.get_today_ist', lambda: date(2026, 10, 30))
    # At 8/12, four more attended periods reach 12/16 = 75%.
    assert add(client, log_date='2026-11-01', subject='Guest Lecture', periods=4).status_code == 200
    result = client.get('/api/attendance/target-calculator?target_percentage=75')
    assert result.status_code == 200
    assert result.json()['periods_needed'] == 4
    assert result.json()['projected_date'] == '2026-11-01'


def test_account_data_export_includes_only_owned_extra_classes(attendance):
    client, user = attendance
    assert add(client, subject='Guest Lecture', status='present').status_code == 200
    user['id'] = 2
    assert add(client, subject='Private class').status_code == 200
    user['id'] = 1
    result = client.get('/api/auth/my-data')
    assert result.status_code == 200
    assert result.json()['extra_classes_count'] == 1
    assert result.json()['extra_classes'][0]['subject'] == 'Guest Lecture'
