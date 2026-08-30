const API_BASE = import.meta.env.VITE_API_URL || '/api';

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

export function getStoredUser() {
  const user = localStorage.getItem('attendance_user');
  return user ? JSON.parse(user) : null;
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('attendance_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('attendance_user');
  }
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
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
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request('/auth/me'),
  updateBaseline: (payload) => request('/auth/baseline', { method: 'PUT', body: JSON.stringify(payload) }),
  updateSection: (sectionId) => request('/auth/section', { method: 'PUT', body: JSON.stringify({ section_id: sectionId }) }),

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

  // Backup
  triggerBackup: () => request('/admin/backup', { method: 'POST' })
};
