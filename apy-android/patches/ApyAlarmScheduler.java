package com.capacitorjs.plugins.localnotifications;

import android.app.AlarmManager;
import android.app.PendingIntent;

/** Calendar recurrence must preserve the original alarm's idle/wakeup semantics. */
public final class ApyAlarmScheduler {
    private ApyAlarmScheduler() {}

    public static void schedule(AlarmManager alarms, boolean exactAllowed, boolean allowWhileIdle, long trigger, PendingIntent intent) {
        if (allowWhileIdle) {
            if (exactAllowed) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, intent);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, intent);
            }
        } else if (exactAllowed) {
            alarms.setExact(AlarmManager.RTC, trigger, intent);
        } else {
            alarms.set(AlarmManager.RTC, trigger, intent);
        }
    }
}
