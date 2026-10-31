import { useState } from 'react';

const storageKey = 'apy_local_theme_preview';
let initialTheme = 'sky';
try { initialTheme = localStorage.getItem(storageKey) === 'original' ? 'original' : 'sky'; } catch { /* Preview still works without storage. */ }
document.documentElement.dataset.theme = initialTheme;

export default function ThemePreview() {
  const [theme, setTheme] = useState(initialTheme);
  function selectTheme(next) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Session-only preference. */ }
  }
  return (
    <aside className="theme-preview-bar" aria-label="Local theme preview">
      <span className="theme-preview-label"><span className="theme-preview-dot" /> LOCAL PREVIEW</span>
      <div className="theme-preview-options" role="group" aria-label="Choose preview theme">
        <button type="button" aria-pressed={theme === 'sky'} onClick={() => selectTheme('sky')}>Sky & Pink</button>
        <button type="button" aria-pressed={theme === 'original'} onClick={() => selectTheme('original')}>Original theme</button>
        <button type="button" onClick={() => window.__replayIntro?.()}>Replay intro</button>
      </div>
    </aside>
  );
}
