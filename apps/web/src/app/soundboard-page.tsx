import { Soundboard } from '@subspace-lattice/react';
import { MarketingNav } from './marketing-nav';
import './soundboard-page.scss';

/** Marketing shell around the SFX catalog — same atelier chrome as soundtrack. */
export function SoundboardPage() {
  return (
    <div className="soundboard-page">
      <MarketingNav
        active="soundboard"
        cta={{ to: '/play', label: 'Enter Sector 11' }}
      />
      <Soundboard />
    </div>
  );
}
