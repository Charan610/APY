Android reminder reliability update (v1.4.8, build 12).

- Fix daily recurring reminders so later occurrences preserve wakeup and idle behavior.
- Restore saved reminders on app launch and resume, with offline recovery for the signed-in account.
- Validate and deduplicate times; show scheduling failures instead of reporting false success.
- Cancel only attendance reminders, preserving update and test notifications.
- Add a distinct APY chime with new Android notification channels.
- Show notification permission, exact-alarm access, and scheduled-reminder diagnostics.

Install this APK, open Settings → Reminders, and check notification and exact-alarm access. Android and user sound/DND settings still apply.

Validation: 19 reminder tests and Android APK build passed. Signature matches the previous release. Sleeping-device, reboot delivery, and audible sound still require verification on a physical Android device. Browser scheduler work is held for the next update.
