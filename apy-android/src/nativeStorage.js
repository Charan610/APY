import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'attendance_jwt_token';
const USER_KEY = 'attendance_user';
const API_URL_KEY = 'attendance_api_url';

export const nativeStorage = {
  async getToken() {
    try {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      if (value) return value;
    } catch (e) {}
    return localStorage.getItem(TOKEN_KEY);
  },

  async setToken(token) {
    if (token) {
      try {
        await Preferences.set({ key: TOKEN_KEY, value: token });
      } catch (e) {}
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      try {
        await Preferences.remove({ key: TOKEN_KEY });
      } catch (e) {}
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  async getUser() {
    try {
      const { value } = await Preferences.get({ key: USER_KEY });
      if (value) return JSON.parse(value);
    } catch (e) {}
    const local = localStorage.getItem(USER_KEY);
    return local ? JSON.parse(local) : null;
  },

  async setUser(user) {
    if (user) {
      const str = JSON.stringify(user);
      try {
        await Preferences.set({ key: USER_KEY, value: str });
      } catch (e) {}
      localStorage.setItem(USER_KEY, str);
    } else {
      try {
        await Preferences.remove({ key: USER_KEY });
      } catch (e) {}
      localStorage.removeItem(USER_KEY);
    }
  },

  async getApiUrl() {
    try {
      const { value } = await Preferences.get({ key: API_URL_KEY });
      if (value && !value.includes('localhost') && !value.includes('127.0.0.1')) {
        return value;
      }
    } catch (e) {}
    const local = localStorage.getItem(API_URL_KEY);
    if (local && !local.includes('localhost') && !local.includes('127.0.0.1')) {
      return local;
    }
    return import.meta.env.VITE_API_URL || 'https://apy-mu.vercel.app/api';
  },

  async setApiUrl(url) {
    if (url) {
      try {
        await Preferences.set({ key: API_URL_KEY, value: url });
      } catch (e) {}
      localStorage.setItem(API_URL_KEY, url);
    }
  }
};
