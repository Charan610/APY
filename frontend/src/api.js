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

export function getAuthToken() {
  return localStorage.getItem('attendance_jwt_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('attendance_jwt_token', token);
  } else {
    localStorage.removeItem('attendance_jwt_token');
  }
}

export const ADMIN_REGISTER_NUMBERS = ['25B91A05D8', '23B91A05C0', '23B91A0588', '23B91A0577'];

export function checkIsAdmin(user) {
  if (!user) return false;
  if (user.is_admin === true || user.is_admin === 1 || user.is_admin === 'true') return true;
  const reg = (user.register_number || '').trim().toUpperCase();
  return ADMIN_REGISTER_NUMBERS.includes(reg);
}

export function getStoredUser() {
  const userStr = localStorage.getItem('attendance_user');
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr);
    if (user && typeof user === 'object') {
      user.is_admin = checkIsAdmin(user);
    }
    return user;
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
    localStorage.setItem('attendance_user', JSON.stringify(enrichedUser));
  } else {
    localStorage.removeItem('attendance_user');
  }
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `Request failed with status ${response.status}`);
  }
  return data;
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
    removeAuthToken();
    removeStoredUser();
  },
  getMe: () => request('/auth/me'),
  getMyData: () => request('/auth/my-data'),
  deleteMyAccount: () => request('/auth/account', { method: 'DELETE' }),
  updateBaseline: (payload) => request('/auth/baseline', { method: 'PUT', body: JSON.stringify(payload) }),
  updateSection: (sectionId) => request('/auth/section', { method: 'PUT', body: JSON.stringify({ section_id: sectionId }) }),
  changePin: (payload) => request('/auth/change-pin', { method: 'PUT', body: JSON.stringify(payload) }),

  // Sections
  getSections: () => request('/sections'),
  getSectionTimetable: (sectionId) => request(`/sections/${sectionId}/timetable`),
  createSection: (payload) => request('/sections/create', { method: 'POST', body: JSON.stringify(payload) }),
  updateTimetable: (sectionId, payload) => request(`/sections/${sectionId}/timetable`, { method: 'PUT', body: JSON.stringify(payload) }),

  // Attendance
  getLogs: (startDate, endDate) => request(`/attendance/logs?start_date=${startDate || ''}&end_date=${endDate || ''}`),
  markAttendance: (logDate, entries) => request('/attendance/mark', {
    method: 'POST',
    body: JSON.stringify({ log_date: logDate, entries })
  }),
  getSummary: () => request('/attendance/summary'),
  getForecast: (targetDate) => request(`/attendance/forecast?target_date=${targetDate}`),

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
  sendTestNotification: () => request('/notifications/test', { method: 'POST' })
};
