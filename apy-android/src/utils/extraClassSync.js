const CHANGE_EVENT = 'apy_extra_classes_changed';

export function notifyExtraClassesChanged(date, target = window) {
  target.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { date } }));
}

export function subscribeExtraClasses({ date, load, onRecords, onLoading, onError, target = window }) {
  let active = true;
  let requestVersion = 0;
  async function refresh(reconcile = false) {
    const version = ++requestVersion;
    if (reconcile) onLoading(true);
    try {
      const result = await load(date, date);
      if (active && version === requestVersion) {
        onRecords(result.extra_classes_by_date?.[date] || result.extra_classes || []);
      }
    } catch (error) {
      if (active && version === requestVersion) onError(error);
    } finally {
      if (active && version === requestVersion) onLoading(false);
    }
  }
  function onChange(event) {
    if (event.detail?.date === date) void refresh(true);
  }
  target.addEventListener(CHANGE_EVENT, onChange);
  void refresh();
  return () => {
    active = false;
    target.removeEventListener(CHANGE_EVENT, onChange);
  };
}
