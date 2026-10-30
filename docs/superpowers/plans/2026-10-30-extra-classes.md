# Extra Classes Implementation Plan

> **For agentic workers:** Use inline execution with parallel frontend implementation; verify each task before local review.

**Goal:** Add date-specific extra-class attendance below existing subjects on web and Android for localhost review.

**Architecture:** Independent extra_classes table with user ownership, baseline validation and authenticated CRUD. Merge extra records into summaries and export, while preserving recurring timetable and regular attendance writes.

**Tech Stack:** FastAPI, Pydantic, SQLite/Turso, React, Vite, Capacitor.

**Spec:** docs/superpowers/specs/2026-10-30-extra-classes-design.md

## Global Constraints
- Local review completed; the user subsequently authorized publishing website and Android v1.4.7.
- Any date strictly after baseline; regular attendance keeps seven-day restrictions.
- Period count integer 1–10; statuses unmarked/present/absent/holiday; optional session morning/afternoon/unspecified.
- Both frontend source trees and backend runtime copies must agree.

## Review Focus
- Ownership isolation: another user cannot read or mutate records.
- Baseline and malformed dates: reject dates covered by historical totals.
- Date navigation while requests are pending: stale results cannot leak onto another date.
- Multiple extra classes: updates/deletion leave regular records and other extras unchanged.
- Summary and forecast: unmarked entries do not count as attendance and marked extras are not counted twice.

### Task 1: Backend persistence and calculations
- [x] Write real SQLite/API regression tests for CRUD, user ownership, date/period validation, subject aggregation, deletion, export and forecast.
- [x] Run new tests and observe missing-endpoint failures.
- [x] Implement additive schema migration, authenticated CRUD, summary/export/forecast integration; synchronize backend runtime copies.
- [x] Run backend tests against isolated temporary databases.

### Task 2: Web and Android UI
- [x] Implement API helpers, date picker and independent ExtraClasses component below regular subjects, keeping platform-specific behavior.
- [x] Include subject suggestions, periods, session, status actions, edit/remove, loading/error handling and narrow-screen layout.
- [x] Build both frontends and lint changed web files.

### Task 3: Local end-to-end review
- [x] Start isolated local API and web server without cloud access or notification scheduling.
- [x] Exercise adding multiple classes, marking, editing/removing, persistence, dates, totals and mobile layout in a browser.
- [x] Review diff and report localhost URL and verified behavior.

## Verification and review
- Backend: 45 tests pass, including 28 extra-class API tests, release fallback regression tests and existing tests.
- Frontend: 5 synchronization regression tests pass; observed missing-refresh failures before implementing the fix.
- Both Vite builds pass; changed-file lint has no errors (existing-file warnings remain).
- Local browser exercised adding two subjects, present/absent, period edits, arbitrary future date, Sunday and baseline locking; 375px layout was checked separately.
- Independent backend and frontend reviews found missing account export and date-switch reconciliation; both fixed with regression coverage.
- User reviewed the localhost preview and authorized pushing and publishing website and Android v1.4.7.
- Android Gradle assembleDebug passed; APK version 1.4.7/build 11 and signing certificate verified against the existing release.
