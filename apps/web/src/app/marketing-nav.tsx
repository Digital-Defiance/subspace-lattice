import { Link } from 'react-router-dom';
import './marketing-nav.scss';

export type MarketingNavActive =
  | 'home'
  | 'play'
  | 'rules'
  | 'deep-lattice'
  | 'soundtrack'
  | 'soundboard'
  | 'story';

export type MarketingNavProps = {
  active?: MarketingNavActive;
  /** Optional trailing action (e.g. Challenge Deep Lattice). */
  cta?: { to: string; label: string; testId?: string };
};

/**
 * Thin chrome for marketing / atelier pages — not the live board.
 * Keeps splash heroes free of site-map clutter.
 */
export function MarketingNav({ active, cta }: MarketingNavProps) {
  return (
    <nav className="mkt-nav" aria-label="Site">
      <div className="mkt-nav__inner">
        <Link
          to="/"
          className={`mkt-nav__home${active === 'home' ? ' mkt-nav__link--active' : ''}`}
        >
          Command deck
        </Link>

        <ul className="mkt-nav__primary">
          <li>
            <Link
              to="/play"
              className={active === 'play' ? 'mkt-nav__link--active' : undefined}
            >
              Play
            </Link>
          </li>
          <li>
            <Link
              to="/rules"
              className={active === 'rules' ? 'mkt-nav__link--active' : undefined}
            >
              Rules
            </Link>
          </li>
        </ul>

        <ul className="mkt-nav__atelier" aria-label="Fleet atelier">
          <li>
            <Link
              to="/deep-lattice"
              className={`mkt-nav__deep${active === 'deep-lattice' ? ' mkt-nav__link--active' : ''}`}
              aria-label="Deep Lattice"
              data-testid="nav-deep-lattice"
            >
              <img
                src="/deep-lattice-text.svg"
                width={180}
                height={22}
                alt=""
                decoding="async"
              />
            </Link>
          </li>
          <li>
            <Link
              to="/soundtrack"
              className={
                active === 'soundtrack' ? 'mkt-nav__link--active' : undefined
              }
            >
              Soundtrack
            </Link>
          </li>
          <li>
            <Link
              to="/soundboard"
              className={
                active === 'soundboard' ? 'mkt-nav__link--active' : undefined
              }
            >
              Soundboard
            </Link>
          </li>
        </ul>

        {cta ? (
          <Link
            to={cta.to}
            className="mkt-nav__cta"
            data-testid={cta.testId}
          >
            {cta.label}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
