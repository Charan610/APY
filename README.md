# APY — Attendance Ledger & Bunk Forecaster (Web + Android)

<div align="center">
  <img src="apy-android/src/assets/icon.png" width="120" height="120" alt="APY Logo" style="border-radius: 24px; box-shadow: 0 4px 20px rgba(217, 119, 6, 0.3);" />
  <h3><strong>APY (ATT PER Y)</strong></h3>
  <p><strong>A collegiate multi-user attendance tracking, baseline onboarding, and 75% threshold bunk-forecasting platform.</strong></p>

  <p>
    <a href="https://github.com/Charan610/APY/raw/main/apy-android/APY.apk">
      <img src="https://img.shields.io/badge/Download%20APK-Android%20Direct-gold?style=for-the-badge&logo=android&logoColor=black" alt="Download APK" />
    </a>
    <a href="https://apy-i1s1.vercel.app">
      <img src="https://img.shields.io/badge/Live%20Web-apy--i1s1.vercel.app-blue?style=for-the-badge&logo=vercel" alt="Live Web App" />
    </a>
    <img src="https://img.shields.io/badge/FastAPI-Python%203.11+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/React%2018-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18" />
  </p>
</div>

---

## 📱 Download the Android App
Download and install the pre-compiled **APY APK** directly on your Android phone:
- **Direct Download Link**: [**Download APY.apk**](https://github.com/Charan610/APY/raw/main/apy-android/APY.apk)
- **File Location in Repo**: [`apy-android/APY.apk`](file:///Users/charan/APY/apy-android/APY.apk)
- **Live Web App**: [https://apy-i1s1.vercel.app](https://apy-i1s1.vercel.app)

---

## 🌟 Core Features

### 1. 🎓 Collegiate Baseline Attendance Onboarding
- **Zero Backfill Fatigue**: Students onboarding mid-semester do not need to manually enter weeks of historical data.
- Input your current attendance percentage / ratio (e.g. `193 / 262` as of August 24) once during registration or in Settings.
- APY sets a strict baseline cutoff timestamp: all logs marked *after* this cutoff date are dynamically weighted and combined with your baseline ratio.
- Baseline totals are server-protected: past historical dates are locked to prevent retroactive skewing.

### 2. 📅 Branch Timetables & Custom Section Engine
- **Pre-Seeded Official Sections**: Instant one-click selection for **CSE (A, B, C, D, E)**, **AIDS (B, D)**, and **AIML (B)** with accurate weekly periods, lecture slots, and 4-period lab blocks.
- **Custom Section Builder**: Students from any branch (ECE, EEE, MECH, CIVIL, IT) can create their own section timetable in 60 seconds with drag-and-drop weekday schedule blocks.
- **Period Weighting**: Distinct period weights (1-period lecture, 2-period tutorial, 4-period laboratory) are automatically factored into calculations.

### 3. 🎯 75% Threshold Calculator & Bunk-Safety Engine
- Real-time mathematical guidance on every screen:
  - **Safe to Bunk**: Exact count of consecutive upcoming periods you can safely miss without dipping below 75%.
  - **Must Attend**: Exact number of consecutive periods you must attend to climb back above 75% if you are currently in the danger zone.
  - **Color-Coded Status**: Emerald Green (>=75%), Amber Warning (70-74.9%), Crimson Alert (<70%).

### 4. 🔮 FAT (Forecast Attendance Tool)
- 7-day forward simulator projecting attendance trends for the upcoming week.
- Interactive toggle allows students to test scenarios: *"What will my attendance be if I take Friday off?"* or *"What if I attend all Monday labs?"*

### 5. 🌐 Web vs. 📱 App Session Tracking (Single Shared Database)
- Both the Web frontend and Android app talk to the **exact same live backend API** (`https://apy-i1s1.vercel.app/api`) and shared Turso Cloud / SQLite database.
- **Additive `login_sessions` table**:
  - Automatically identifies whether a login originates from `web`, `android`, or `ios`.
  - Records session hashes and refreshes `last_seen_at` on every active request.
  - Zero data duplication, zero desync.

### 6. 🛡️ Admin PIN Reset & Student Verification Panel
- Accessible only by designated admin register numbers (e.g. `25B91A05D8`, `23B91A05C0`).
- Search any student by register number to inspect:
  - Verified branch & section.
  - Baseline attended/total periods and cutoff date.
  - Total logged daily periods.
  - Active platform adoption badges (`🌐 Web`, `📱 Android`, `🍏 iOS`) with recent session activity.
- Generates cryptographically secure 4-digit temporary reset PINs logged in an immutable audit ledger (`pin_reset_log`).

### 7. 🔔 PWA & Mobile Native Experience
- Built on **Capacitor 7** targeting Android with native hardware back-button handling, tactile haptics on attendance marking, dark collegiate theme, and persistent biometric/native token storage.
- Inline Server Settings drawer on login screen for testing and configuring backend endpoints.

---

## 📐 Mathematical Formulas

$$\text{Cumulative Total} = \text{Baseline Total} + \sum \text{Logged Periods}$$
$$\text{Cumulative Attended} = \text{Baseline Attended} + \sum \text{Present Periods}$$
$$\text{Attendance \%} = \left(\frac{\text{Cumulative Attended}}{\text{Cumulative Total}}\right) \times 100$$

- **When $\text{Attendance} \ge 75\%$**:
  $$\text{Safe Bunks} = \left\lfloor \frac{\text{Attended} - (0.75 \times \text{Total})}{0.75} \right\rfloor$$
- **When $\text{Attendance} < 75\%$**:
  $$\text{Must Attend} = \left\lceil \frac{(0.75 \times \text{Total}) - \text{Attended}}{0.25} \right\rceil$$

---

## 🏗️ Architecture & Directory Structure

```
APY/
├── apy-android/             # Standalone Native Android Mobile App (Capacitor 7)
│   ├── APY.apk              # Pre-compiled, installable Android APK (Direct Download)
│   ├── android/             # Android Studio Native Project (Gradle, Manifest, Res)
│   ├── src/                 # React UI + Native Storage + Platform API Client
│   └── capacitor.config.json
├── backend/                 # Core Python FastAPI Backend
│   ├── routers/             # auth_routes, section_routes, attendance_routes, admin_routes
│   ├── auth.py              # SHA-256 password hashing & JWT token validation
│   ├── database.py          # SQLite WAL mode & Turso Cloud keep-alive pooled client
│   └── main.py              # FastAPI application & CORS configuration
├── frontend/                # Web Application (React 18 + Vite + Vanilla CSS)
├── api/                     # Vercel Serverless Python API bridge
└── scripts/                 # Utility & asset generation scripts
```

---

## 🚀 Development & Build Guide

### 1. Web Application & Backend (Local)
```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

### 2. Android App (Capacitor + Gradle)
```bash
cd apy-android
npm install
npm run build
npx cap sync android

# Compile APK (Requires Java 21 & Android SDK)
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/Library/Android/sdk
cd android
./gradlew assembleDebug

# Install on USB-connected Android device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔒 Security & Privacy
- Passwords and PINs are stored as secure, one-way cryptographic hashes.
- Server-side edit window bounds data manipulation to valid active cycles (`today - 7 days <= log_date <= today`).
- Rate limiting on authentication endpoints stops brute-force attempts.
- Automated snapshot backups protect against data loss.

---

<div align="center">
  <p>Built with ❤️ for engineering students everywhere.</p>
</div>
