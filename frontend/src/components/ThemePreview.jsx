import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme } from '../theme';

export default function ThemePreview() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const selectTheme = setTheme;
  return (
    <aside className="theme-preview-bar" aria-label="Local theme preview">
      <span className="theme-preview-label"><span className="theme-preview-dot" /> LOCAL PREVIEW</span>
      <div className="theme-preview-options" role="group" aria-label="Choose preview theme">
        <button type="button" aria-pressed={theme === 'silver'} onClick={() => selectTheme('silver')}>Dark Silver</button>
        <button type="button" aria-pressed={theme === 'pink'} onClick={() => selectTheme('pink')}>Sky & Pink</button>
        <button type="button" aria-pressed={theme === 'original'} onClick={() => selectTheme('original')}>Original theme</button>
        <button type="button" aria-pressed={theme === 'tide'} onClick={() => selectTheme('tide')}>Tide</button>
        <button type="button" onClick={() => window.__replayIntro?.()}>Replay intro</button>
      </div>
    </aside>
  );
}
