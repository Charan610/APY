# CSE Attendance Register (Multi-User Web App)

A personal multi-user attendance tracking and bunk-forecasting web application for engineering students, built with **FastAPI + SQLite (WAL Mode)** and **React + Vite** following a warm academic parchment ledger aesthetic.

---

## Features
- **College Register Number + PIN Authentication** (bcrypt hashed, brute-force rate limited).
- **Pre-Seeded CSE Timetables** (Sections A, B, C, D, E from official department timetable with 4-period labs).
- **Self-Onboarding & Timetable Builder** for any other branch (AIDS, ECE, IT, etc.) or section.
- **Strict Server-Enforced 7-Day Edit Window** (`today - 7 days <= log_date <= today`).
- **Period-Weighted Attendance Math & Historical Baseline Integration**.
- **Bunk-Safety Engine** with 75% threshold alerts & recovery targets.
- **FAT (Forecast Attendance Tool)**: 7-day forward-look simulator with side-by-side present vs absent comparisons.
- **Data Durability**: SQLite in WAL mode with timestamped snapshot backups.

---

## Local Setup

### 1. Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment Guide

### A. Deploy Backend (Render / Railway / Fly.io)
1. Link this repository on [Render](https://render.com).
2. Set Root Directory to `backend`, Build Command to `pip install -r requirements.txt`, and Start Command to `uvicorn main:app --host 0.0.0.0 --port 10000`.
3. (Optional) Add a Persistent Disk mounted to `/Users/charan/APY/backend` so `attendance.db` is never reset on redeployments.
4. Copy your live backend URL (e.g. `https://apy-backend.onrender.com`).

### B. Deploy Frontend (Vercel)
1. Import this repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Vite`.
4. Add Environment Variable:
   - `VITE_API_URL` = `https://apy-backend.onrender.com/api`
5. Click **Deploy**.
