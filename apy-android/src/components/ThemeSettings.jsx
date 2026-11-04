import { useSyncExternalStore } from 'react';
import { Check, Palette } from 'lucide-react';
import { getTheme, setTheme, subscribeTheme } from '../theme';
import './ThemeSettings.css';

const choices = [
  { id: 'tide', name: 'Tide', detail: 'Navy, cream & coral drifting clouds' },
  { id: 'original', name: 'Original', detail: 'Warm paper & forest green' },
  { id: 'pink', name: 'Pink', detail: 'Blue & pink frosted glass' },
  { id: 'silver', name: 'Silver', detail: 'Dark metal & vivid accents' },
];
export default function ThemeSettings() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  return <section className="theme-settings" aria-label="Appearance">
    <div className="theme-settings-heading"><Palette size={20} /><h3>Choose your theme</h3></div>
    <p>Make it yours. Your choice applies instantly and is saved on this device.</p>
    <div className="theme-choice-list" role="group" aria-label="Website theme">
      {choices.map(choice => <button key={choice.id} type="button" className={`theme-choice ${theme === choice.id ? 'selected' : ''}`} aria-pressed={theme === choice.id} onClick={() => setTheme(choice.id)}>
        <span className={`theme-swatch theme-swatch-${choice.id}`} aria-hidden="true"><span className="theme-swatch-panel"><i /><i /><i /></span></span>
        <span className="theme-choice-copy"><strong>{choice.name}</strong><span>{choice.detail}</span></span>
        <span className="theme-choice-check" aria-hidden="true">{theme === choice.id && <Check size={17} />}</span>
      </button>)}
    </div>
  </section>;
}
