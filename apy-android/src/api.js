import { nativeStorage } from './nativeStorage';

let cachedApiUrl = localStorage.getItem('attendance_api_url') || import.meta.env.VITE_API_URL || 'https://apy-navy.vercel.app/api';

export function getApiBase() {
  return cachedApiUrl;
}

export function setApiBase(url) {
  if (url) {
    cachedApiUrl = url;
    nativeStorage.setApiUrl(url);
  }
}

export function getAuthToken() {
  return localStorage.getItem('attendance_jwt_token');
}

export function setAuthToken(token) {
  nativeStorage.setToken(token);
}

export function getStoredUser() {
  const user = localStorage.getItem('attendance_user');
  return user ? JSON.parse(user) : null;
}

export function setStoredUser(user) {
  nativeStorage.setUser(user);
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${cachedApiUrl}${endpoint}`, {
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
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request('/auth/me'),
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
  searchStudent: (regNo) => request(`/admin/search?register_number=${encodeURIComponent(regNo)}`),
  resetStudentPin: (regNo) => request('/admin/reset-pin', {
    method: 'POST',
    body: JSON.stringify({ target_register_number: regNo })
  }),
  getAdminResetLogs: (limit = 25) => request(`/admin/reset-logs?limit=${limit}`),

  // Daily Reminder Notifications
  getNotificationConfig: () => request('/notifications/config'),
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
