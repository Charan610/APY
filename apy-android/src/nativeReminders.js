// Platform-independent scheduling policy; the native adapter supplies device I/O.
export const REMINDER_CHANNEL = 'apy_attendance_reminders_v2';
export const UPDATE_CHANNEL = 'apy_app_updates_v2';
export function buildReminders(times) {
  if (!Array.isArray(times)) throw new Error('Reminder times must be a list.');
  const unique = new Map();
  for (const item of times) {
    if (!item || typeof item.time_of_day !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time_of_day)) {
      throw new Error('Every reminder must use a valid HH:MM time.');
    }
    const [hour, minute] = item.time_of_day.split(':').map(Number);
    const minutes = hour * 60 + minute;
    if (!unique.has(minutes)) unique.set(minutes, {
      id: 110000 + minutes,
      title: `🎓 APY: ${item.label || 'Attendance Reminder'}`,
      body: 'Time to mark your class periods! Tap to record attendance.',
      channelId: REMINDER_CHANNEL,
      schedule: { on: { hour, minute, second: 0 }, allowWhileIdle: true },
      sound: 'apy_reminder.wav',
      extra: { time: item.time_of_day, type: 'attendance_reminder' }
    });
  }
  if (unique.size > 48) throw new Error('Choose at most 48 distinct reminder times.');
  return [...unique.entries()].sort(([a], [b]) => a - b).map(([, n]) => n);
}
export function ownsReminder(n) {
  return Number.isInteger(n.id) && ((n.id >= 110000 && n.id < 111440) ||
    (n.id >= 101 && n.id < 1000) || n.extra?.type === 'attendance_reminder');
}
export function createReminderController({ plugin, initChannels, storage, fetchConfig, isSessionCurrent = () => true }) {
  let account = null, session = null, generation = 0, queue = Promise.resolve(), needsSessionCleanup = false;
  const enqueue = work => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  const cancelOwned = async () => {
    const pending = await plugin.getPending();
    const owned = pending.notifications.filter(ownsReminder).map(({ id }) => ({ id }));
    if (owned.length) await plugin.cancel({ notifications: owned });
  };
  const setSession = (nextAccount, nextSession) => {
    if (account !== nextAccount || session !== nextSession) {
      if (account !== nextAccount) {
        const previousOwner = storage.getItem('apy_native_reminder_owner_v2');
        needsSessionCleanup = account !== null || (previousOwner != null && previousOwner !== nextAccount);
      }
      account = nextAccount; session = nextSession; generation++;
    }
  };
  const snapshot = () => ({ account, session, generation });
  const current = ticket => account === ticket.account && session === ticket.session && generation === ticket.generation && isSessionCurrent(ticket);
  const normalize = config => {
    if (typeof config?.enabled !== 'boolean') throw new Error('Invalid reminder configuration.');
    const times = config.active_times ?? config.times;
    // Validate disabled configurations too, before touching any existing alarm.
    buildReminders(times);
    return { enabled: config.enabled, active_times: times };
  };
  const apply = (config, ticket) => enqueue(async () => {
    if (!current(ticket)) throw new Error('Reminder session changed; please retry.');
    if (!ticket.account || !ticket.session) throw new Error('Sign in before scheduling reminders.');
    const notifications = buildReminders(config.active_times);
    if (config.enabled && notifications.length) await initChannels();
    if (!current(ticket)) throw new Error('Reminder session changed; please retry.');
    await cancelOwned();
    if (current(ticket)) needsSessionCleanup = false;
    if (!current(ticket)) throw new Error('Reminder session changed; please retry.');
    if (config.enabled && notifications.length) await plugin.schedule({ notifications });
    if (!current(ticket)) {
      // Native I/O cannot be aborted; undo a completed stale operation before the queue advances.
      await cancelOwned();
      throw new Error('Reminder session changed; please retry.');
    }
    storage.setItem(`apy_native_reminders_v2:${ticket.account}`, JSON.stringify(config));
    storage.setItem('apy_native_reminder_owner_v2', ticket.account);
    return { scheduled: config.enabled ? notifications.length : 0 };
  });
  return {
    setSession,
    save(config) {
      const normalized = normalize(config);
      generation++;
      return apply(normalized, snapshot());
    },
    async reconcile(fetch = fetchConfig) {
      generation++;
      const ticket = snapshot();
      if (!ticket.account || !ticket.session) return enqueue(cancelOwned);
      if (needsSessionCleanup) {
        await enqueue(async () => {
          if (!current(ticket)) return;
          await cancelOwned();
          if (current(ticket)) needsSessionCleanup = false;
        });
      }
      if (!current(ticket)) return;
      let config;
      try { config = await fetch(); }
      catch (error) {
        if (!current(ticket)) return;
        const cached = storage.getItem(`apy_native_reminders_v2:${ticket.account}`);
        if (!cached) {
          // Unknown current-account preferences must not leave another account's alarms behind.
          await enqueue(async () => { if (current(ticket)) await cancelOwned(); });
          throw error;
        }
        config = normalize(JSON.parse(cached));
      }
      if (!current(ticket)) return;
      return apply(normalize(config), ticket);
    },
    clear() { generation++; return enqueue(cancelOwned); }
  };
}
