import { apiCache } from './utils/apiCache';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function getApiBase() {
  return localStorage.getItem('attendance_api_url') || import.meta.env.VITE_API_URL || '/api';
}

export function setApiBase(url) {
  if (url) {
    let clean = url.trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (!clean.endsWith('/api') && !clean.includes('/api/')) clean = `${clean}/api`;
    localStorage.setItem('attendance_api_url', clean);
  }
}

let inMemoryToken = null;
try {
  const t = localStorage.getItem('attendance_jwt_token');
  if (t && t !== 'undefined' && t !== 'null') inMemoryToken = t.trim();
} catch {}

export function getAuthToken() {
  if (inMemoryToken && inMemoryToken !== 'undefined' && inMemoryToken !== 'null') {
    return inMemoryToken;
  }
  try {
    const token = localStorage.getItem('attendance_jwt_token');
    if (token && token !== 'undefined' && token !== 'null' && token.trim() !== '') {
      inMemoryToken = token.trim();
      return inMemoryToken;
    }
  } catch {}
  return null;
}

export function setAuthToken(token) {
  if (token && token !== 'undefined' && token !== 'null' && String(token).trim() !== '') {
    inMemoryToken = String(token).trim();
    try { localStorage.setItem('attendance_jwt_token', inMemoryToken); } catch {}
  } else {
    inMemoryToken = null;
    try { localStorage.removeItem('attendance_jwt_token'); } catch {}
  }
}

export const ADMIN_REGISTER_NUMBERS = ['25B91A05D8', '23B91A05C0', '23B91A0588', '23B91A0577'];

export function checkIsAdmin(user) {
  if (!user) return false;
  if (user.is_admin === true || user.is_admin === 1 || user.is_admin === 'true') return true;
  const reg = (user.register_number || '').trim().toUpperCase();
  return ADMIN_REGISTER_NUMBERS.includes(reg);
}

let inMemoryUser = null;
try {
  const u = localStorage.getItem('attendance_user');
  if (u) inMemoryUser = JSON.parse(u);
} catch {}

export function getStoredUser() {
  if (inMemoryUser) return inMemoryUser;
  try {
    const userStr = localStorage.getItem('attendance_user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    if (user && typeof user === 'object') {
      user.is_admin = checkIsAdmin(user);
      inMemoryUser = user;
    }
    return inMemoryUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) {
    const enrichedUser = {
      ...user,
      is_admin: checkIsAdmin(user)
    };
    inMemoryUser = enrichedUser;
    try { localStorage.setItem('attendance_user', JSON.stringify(enrichedUser)); } catch {}
  } else {
    inMemoryUser = null;
    try { localStorage.removeItem('attendance_user'); } catch {}
  }
}

async function request(endpoint, options = {}, retried = false) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 6000; // 6s timeout
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.detail || data.message || `Request failed with status ${response.status}`);
      err.status = response.status;
      err.detail = data.detail;
      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('apy_auth_expired', { detail: { message: data.detail } }));
      }
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please check your network.`);
    }
    if (!retried && (options.method === 'GET' || !options.method) && (err.name === 'TypeError' || err.message?.toLowerCase().includes('fetch'))) {
      await new Promise(r => setTimeout(r, 400));
      return request(endpoint, options, true);
    }
    throw err;
  }
}

export const api = {
  // Auth
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify({ platform: 'web', ...payload }) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify({ platform: 'web', ...payload }) }),
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout server note:', e);
    }
    setAuthToken(null);
    setStoredUser(null);
    apiCache.invalidate();
  },
  getMe: () => request('/auth/me'),
  getMyData: () => request('/auth/my-data'),
  deleteMyAccount: () => request('/auth/account', { method: 'DELETE' }),
  updateBaseline: (payload) => {
    apiCache.invalidate();
    return request('/auth/baseline', { method: 'PUT', body: JSON.stringify(payload) });
  },
  updateSection: (sectionId) => {
    apiCache.invalidate();
    return request('/auth/section', { method: 'PUT', body: JSON.stringify({ section_id: sectionId }) });
  },
  changePin: (payload) => request('/auth/change-pin', { method: 'PUT', body: JSON.stringify(payload) }),

  // Sections
  getSections: () => request('/sections'),
  getSectionTimetable: async (sectionId, forceRefresh = false) => {
    const cacheKey = `timetable_${sectionId}`;
    if (!forceRefresh) {
      const cached = apiCache.get(cacheKey);
      if (cached && !cached.isStale) return cached.data;
    }
    const data = await request(`/sections/${sectionId}/timetable`);
    if (data) {
      apiCache.set(cacheKey, data, 60000);
      try { localStorage.setItem(`apy_tt_cache_${sectionId}`, JSON.stringify(data.timetable_by_day || data)); } catch {}
    }
    return data;
  },
  createSection: (payload) => {
    apiCache.invalidate();
    return request('/sections/create', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateTimetable: (sectionId, payload) => {
    apiCache.invalidate();
    return request(`/sections/${sectionId}/timetable`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  // Attendance
  getLogs: async (startDate = '', endDate = '', forceRefresh = false) => {
    const cacheKey = `logs_${startDate}_${endDate}`;
    if (!forceRefresh) {
      const cached = apiCache.get(cacheKey);
      if (cached && !cached.isStale) return cached.data;
    }
    const data = await request(`/attendance/logs?start_date=${startDate || ''}&end_date=${endDate || ''}`);
    if (data) {
      apiCache.set(cacheKey, data, 20000);
      try { localStorage.setItem('apy_logs_cache', JSON.stringify(data.logs_by_date || data)); } catch {}
    }
    return data;
  },
  markAttendance: async (logDate, entries) => {
    apiCache.invalidate();
    return request('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({ log_date: logDate, entries })
    });
  },
  getSummary: async (forceRefresh = false) => {
    const cacheKey = 'summary';
    if (!forceRefresh) {
      const cached = apiCache.get(cacheKey);
      if (cached && !cached.isStale) return cached.data;
    }
    const data = await request('/attendance/summary');
    if (data) {
      apiCache.set(cacheKey, data, 30000);
      try { localStorage.setItem('apy_summary_cache', JSON.stringify(data)); } catch {}
    }
    return data;
  },
  getForecast: (targetDate) => request(`/attendance/forecast?target_date=${targetDate}`),
  getTargetCalculation: (targetPct = 75) => request(`/attendance/target-calculator?target_percentage=${targetPct}`),
  exportCsv: async () => {
    const token = getAuthToken();
    const baseUrl = getApiBase();
    const response = await fetch(`${baseUrl}/attendance/export-csv`, {
      headers: {
        'X-Client-Platform': 'web',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!response.ok) throw new Error('Failed to export CSV');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apy_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },

  // Admin
  triggerBackup: () => request('/admin/backup', { method: 'POST' }),
  getAdminUsers: (limit = 200) => request(`/admin/users?limit=${limit}`),
  searchStudent: (regNo) => request(`/admin/search?register_number=${encodeURIComponent(regNo)}`),
  resetStudentPin: (regNo, customPin = null) => request('/admin/reset-pin', {
    method: 'POST',
    body: JSON.stringify({ target_register_number: regNo, custom_pin: customPin || null })
  }),
  getAdminResetLogs: (limit = 25) => request(`/admin/reset-logs?limit=${limit}`),
  getAdminAuditLogs: (limit = 50) => request(`/admin/audit-logs?limit=${limit}`),
  getPlatformStats: () => request('/admin/platform-stats'),

  // Daily Reminder Notifications
  getNotificationConfig: () => request('/notifications/config'),
  saveNotificationConfig: (payload) => request('/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateNotificationPreferences: (payload) => request('/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  savePushSubscription: (payload) => request('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  removePushSubscription: (payload) => request('/notifications/unsubscribe', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  sendTestNotification: () => request('/notifications/test', { method: 'POST' }),

  // APK Update Broadcasts & Device Sync
  broadcastApkUpdate: (payload = {}) => request('/admin/broadcast-apk-update', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getApkBroadcasts: (limit = 20) => request(`/admin/apk-broadcasts?limit=${limit}`),
  getLatestApkInfo: () => request('/notifications/latest-apk'),
  syncUserDevice: (platform = 'android', appVersion = '') => request('/notifications/sync-device', {
    method: 'POST',
    body: JSON.stringify({ platform, app_version: appVersion })
  })
};

