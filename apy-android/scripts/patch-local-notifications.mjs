import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const originalHash = "c6f39bf6e58524ff33f52d58c7ed72ff8b64d68b89c7c96d21c3c523352bc500";
const patchedHash = "0994a4e19e231172fa651d48a904e12e704f3106ebc6dd6201e1ec7e23dd95d5";
const oldBlock = `            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                Logger.warn(
                    "Capacitor/LocalNotification",
                    "Exact alarms not allowed in user settings.  Notification scheduled with non-exact alarm."
                );
                alarmManager.set(AlarmManager.RTC, trigger, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC, trigger, pendingIntent);
            }
`;
const newBlock = `            // APY: preserve wakeup/Doze behavior on every calendar recurrence.
            JSObject saved = new NotificationStorage(context).getSavedNotificationAsJSObject(Integer.toString(id));
            JSObject savedSchedule = saved == null ? null : saved.getJSObject("schedule");
            boolean allowWhileIdle = savedSchedule != null && savedSchedule.getBoolean("allowWhileIdle", false);
            boolean exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms();
            ApyAlarmScheduler.schedule(alarmManager, exactAllowed, allowWhileIdle, trigger, pendingIntent);
`;
const hash = source => createHash('sha256').update(source).digest('hex');
export function patchReceiver(source, version) {
  if (version !== '7.0.7') throw new Error('APY recurrence patch requires @capacitor/local-notifications 7.0.7; review before upgrading.');
  if (hash(source) === patchedHash) return source;
  if (hash(source) !== originalHash) throw new Error('Unexpected local-notifications receiver source; patch review required.');
  const result = source.replace(oldBlock, newBlock);
  if (hash(result) !== patchedHash) throw new Error('Receiver patch source verification failed.');
  return result;
}
export function installPatch() {
  const base = new URL('../node_modules/@capacitor/local-notifications/', import.meta.url);
  const version = JSON.parse(readFileSync(new URL('package.json', base))).version;
  const receiver = new URL('android/src/main/java/com/capacitorjs/plugins/localnotifications/TimedNotificationPublisher.java', base);
  const original = readFileSync(receiver, 'utf8');
  const result = patchReceiver(original, version);
  if (original !== result) writeFileSync(receiver, result);
  copyFileSync(new URL('../patches/ApyAlarmScheduler.java', import.meta.url), new URL('android/src/main/java/com/capacitorjs/plugins/localnotifications/ApyAlarmScheduler.java', base));
  console.log('Verified APY Capacitor 7.0.7 recurrence patch.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) installPatch();
