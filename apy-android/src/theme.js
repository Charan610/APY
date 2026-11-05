import { Capacitor, registerPlugin } from '@capacitor/core';
const AppAppearance = registerPlugin('AppAppearance');

const THEME_KEY = 'apy_theme';
export const THEMES = ['original', 'pink', 'silver', 'tide'];
let currentTheme = 'silver';
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (THEMES.includes(saved)) currentTheme = saved;
} catch { /* Theme selection still works when storage is unavailable. */ }
const listeners = new Set();
export function getTheme() { return currentTheme; }
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function applyTheme(theme) {
  if (!THEMES.includes(theme)) return;
  currentTheme = theme;
  document.documentElement.dataset.theme = theme === 'original' ? 'original' : 'sky';
  document.documentElement.dataset.finish = ['silver', 'tide'].includes(theme) ? theme : '';
  if (Capacitor.isNativePlatform()) {
    AppAppearance.setTheme({ theme }).catch(error => console.warn('Native theme update failed', error));
  }
}
export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Session-only preference. */ }
  listeners.forEach(listener => listener());
}
applyTheme(currentTheme);
window.addEventListener('storage', event => {
  if (event.key !== THEME_KEY) return;
  applyTheme(THEMES.includes(event.newValue) ? event.newValue : 'silver');
  listeners.forEach(listener => listener());
});
