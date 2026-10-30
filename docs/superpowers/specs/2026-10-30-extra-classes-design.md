# Date-specific extra classes

User requested extra classes below regular attendance subjects on web and Android, reviewed on localhost before deployment. Follow-up authorizes implementation for local review.

Add independent user-owned extra-class records: date, subject, 1–10 periods, optional morning/afternoon session, and unmarked/present/absent/holiday status. Multiple records per date are allowed, including subjects outside the timetable. Reuse an existing subject’s spelling (case-insensitive match) for aggregation. Creating, updating, removing and marking extras affects overall and subject summaries and CSV export. Extra classes do not modify recurring timetable blocks or regular whole-day saves.

Approaches considered: extend recurring timetable blocks (would wrongly change other dates); independent date-specific records (chosen because classes belong to one student and date). Use existing React/FastAPI/SQLite architecture with equivalent web and Android source changes.

Implementation calls for local review: extra classes can be entered on any date strictly after the historical baseline, including Sunday. Regular attendance keeps its seven-day edit rules. Date picker accesses arbitrary dates. Unmarked future extras are plans and do not enter attendance totals; marked entries follow existing summary semantics. Forecast includes planned extra periods without counting marked extras twice. Baseline dates remain locked to prevent double counting. UI offers add, status changes, edit and remove, with visible save/errors. Run locally with an isolated SQLite database and no reminder scheduler or cloud credentials. The initial review was local only; subsequent release authorization is recorded below.

User reviewed the local preview, liked the feature, and authorized pushing and publishing on October 30, 2026. Release website plus compatible Android v1.4.7, build 11; preserve existing signing identity and publish the APK without broadcasting notifications.
