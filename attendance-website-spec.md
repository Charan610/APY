# Build Spec — CSE Attendance Register (Multi-User Web App)

## 1. What this is
A real multi-user website version of a personal attendance tracker. Every student
logs in with their **college register number + a 4–6 digit PIN**, and gets their
own private attendance data — timetable-aware, per-period tracking, subject-wise
and overall percentage against a 75% threshold, a bunk-safety calculator, and a
forward-looking "what happens if I'm absent" forecaster.

Scope: **CSE department only** (any section). Sections that don't have a
pre-built timetable can self-onboard by typing their own.

## 2. Tech stack
- **Backend:** FastAPI + SQLite (WAL mode enabled)
- **Frontend:** React + Vite, plain CSS (no heavy UI framework)
- **Auth:** register number as identifier, PIN hashed with bcrypt/argon2, session
  token (JWT or signed cookie) on login
- **Theme:** dark minimal UI, teal/copper accent system, monospace for all
  numeric/data display, serif for headings — ledger/register aesthetic

## 3. Data model

```
users
  id
  register_number   (unique, indexed)
  pin_hash
  section_id         -> sections.id
  baseline_attended   (int, default 0)
  baseline_total      (int, default 0)
  baseline_date       (date)
  created_at

sections
  id
  branch             (e.g. "CSE")
  section_label      (e.g. "A", "B", "C", "D", "E")
  effective_from      (date)
  unique(branch, section_label)

timetable_blocks
  id
  section_id         -> sections.id
  weekday             (0=Sun..6=Sat)
  order_index          (position within the day)
  subject
  periods             (int — how many periods this block occupies)

daily_logs
  id
  user_id            -> users.id
  log_date
  block_id           -> timetable_blocks.id
  status              (present | absent | holiday)
  updated_at
  unique(user_id, log_date, block_id)
```

## 4. Auth flow
- **Sign up:** register number + choose a 4–6 digit PIN + pick section
  (existing section, or "my section isn't listed" → inline timetable builder,
  same editor pattern as #6).
- **Login:** register number + PIN → session token.
- PIN is never stored or logged in plaintext. Rate-limit login attempts per
  register number to block brute-forcing a 4-digit PIN.

## 5. Edit window rule — enforce server-side, not just in the UI
A `daily_logs` write (create or update) is only accepted if:
```
today - 7 days  <=  log_date  <=  today
```
Reject anything outside that range with a 400, regardless of what the client
sends. This is the one rule that must not be trusted to the frontend.

## 6. Timetable handling
- Pre-load the sections I give you as seed data (see §9 for the one I have
  now — Section C). Structure: for each weekday, an ordered list of
  `{subject, periods}` blocks.
- For any section without seed data, the first user from that section gets a
  "build your section's timetable" screen: for each weekday (Mon–Sat, Sunday
  fixed as holiday and not editable), add/remove/rename blocks and set
  periods-per-block. Once saved, it becomes that section's shared timetable
  for every future student who picks it.
- Sunday is hardcoded holiday in the schema — never rendered as an editable
  day, never counted in totals.

## 7. Core attendance logic
- **Per-period marking:** each day shows that section's blocks for the
  matching weekday; each block gets Present / Absent / Holiday, individually.
- **Weighting:** attendance is counted in *periods*, not blocks — a 4-period
  lab absence counts as 4 missed periods, not 1.
- **Subject %:** attended periods ÷ total periods logged for that subject
  (holiday periods excluded from both).
- **Overall %:** `baseline_attended + Σ(logged attended)` ÷
  `baseline_total + Σ(logged total)`.
- **75% threshold:** any subject or the overall figure below 75% is flagged
  (red, in the ledger-style UI — a hand-drawn scribble circle around the
  number is a nice touch, not required).
- **Bunk-safety calculator**, per subject, given attended `a` and total `t`:
  - if `a/t >= 0.75`: safe-to-miss = `floor(a/0.75 - t)` more periods
  - if `a/t < 0.75`: must-attend-next = `ceil((0.75*t - a) / 0.25)` periods
    in a row to recover

## 8. FAT — Forecast Attendance Tool
For any date within the next 7 days, before the student marks it, show both
outcomes computed from their *current real numbers*:
> "If absent this block → your % becomes X. If present → your % becomes Y."

Applies per-subject and to the overall figure. This is a pure calculation
(same formulas as §7, run twice with the hypothetical block added as
absent/present) — no extra state needed, nothing is saved until the student
actually marks the day.

## 9. Seed data — Section C (CSE, SRKR Engineering College), effective 20-07-2026

| Day | Blocks (subject × periods) |
|---|---|
| Mon | UHV-2 ×2, DMGT ×2 |
| Tue | OOPJ ×2, DBMS ×2, PP LAB ×2, Sports ×1 |
| Wed | DBMS LAB ×4, DLCO ×2 |
| Thu | OOPJ ×2, DLCO ×2, OOPJ LAB ×2 |
| Fri | UHV-2 ×2, DMGT ×2, Counselling ×1 |
| Sat | DBMS ×2, ES ×2 |
| Sun | holiday (fixed, not a data row) |

Baseline for register-number seed user (this section's original tester):
193 attended / 262 total, as of Monday 24-08-2026.

Sections A, B, D, E: **not yet supplied** — leave their `timetable_blocks`
empty and route their first student through the self-onboarding builder
(§6) until real timetables are provided.

## 10. Data durability requirements
- SQLite in WAL mode.
- A scheduled backup (simple cron script copying the `.db` file to a
  timestamped backup on a set interval — hourly or daily is enough at this
  scale) so a bad write or crash can't wipe anyone's history.
- No destructive migrations without a backup step first.

## 11. Non-goals for v1
- No admin dashboard, no cross-user analytics, no notifications — single
  focus: a student logs in, marks periods, sees their percentages and their
  forecast. Keep the surface area small.

## 12. Deployment
- Backend: any small FastAPI-friendly host (Render / Railway / Fly.io free
  tier), or self-hosted on the existing Termux + FastAPI + Tailscale relay
  setup already running.
- Frontend: static host (Vercel / Netlify), pointed at the backend API URL
  via an environment variable.

## 13. Open questions to confirm before/while building
- Confirm scope is "CSE, any section" and not one specific section labeled
  "B" — the spec above assumes the former.
- Timetables for sections A, B, D, E, once available.
- Whether "PIN" should also gate an optional recovery path (e.g. a
  secondary contact) in case a student forgets it — not required for v1 but
  worth deciding before real students start signing up.
