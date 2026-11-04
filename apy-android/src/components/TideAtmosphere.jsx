import { useSyncExternalStore } from 'react';
import { getTheme, subscribeTheme } from '../theme';

export default function TideAtmosphere() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  if (theme !== 'tide') return null;
  return (
    <div className="tide-atmosphere" aria-hidden="true">
      <div className="tide-cloud tide-cloud-distant" />
      <div className="tide-cloud tide-cloud-coral" />
      <div className="tide-cloud tide-cloud-cream" />
      <div className="tide-cloud tide-cloud-near" />
      <div className="tide-fluted-glass" />
    </div>
  );
}
