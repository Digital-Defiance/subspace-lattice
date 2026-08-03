import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LATTICE_HANDBOOK_ORIGIN,
  type LatticeDocId,
} from '../lib/doc-links';
import { DocLink } from './DocLink';
import './PlayerDocsLinks.scss';

export type PlayerDocsOmit =
  | LatticeDocId
  | 'storyPage'
  | 'rulesTour'
  | 'setupDiagram'
  | 'annotate'
  | 'deepLattice'
  | 'puzzles'
  | 'standings';

export type PlayerDocsLinksProps = {
  /** `list` for dialogs / academy; `inline` for landing / lobby footers. */
  layout?: 'list' | 'inline';
  className?: string;
  /** Close dialogs / leave overlays when following in-app routes. */
  onNavigate?: () => void;
  omit?: readonly PlayerDocsOmit[];
};

/**
 * Canonical player-facing reading list — story, overview, manuals, rules PDF,
 * handbook, and in-app tours. Keep landing / Rules / academy in sync here.
 */
export function PlayerDocsLinks({
  layout = 'list',
  className,
  onNavigate,
  omit = [],
}: PlayerDocsLinksProps) {
  const skip = new Set(omit);
  const show = (id: PlayerDocsOmit) => !skip.has(id);

  if (layout === 'inline') {
    const parts: ReactNode[] = [];
    const push = (node: ReactNode) => {
      if (parts.length) {
        parts.push(
          <span key={`sep-${parts.length}`} aria-hidden="true">
            {' · '}
          </span>,
        );
      }
      parts.push(node);
    };

    if (show('storyPage')) {
      push(
        <Link key="story" to="/story" onClick={onNavigate}>
          Sector 11
        </Link>,
      );
    }
    if (show('puzzles')) {
      push(
        <Link key="puzzles" to="/puzzles" onClick={onNavigate}>
          Puzzles
        </Link>,
      );
    }
    if (show('standings')) {
      push(
        <a
          key="standings"
          href="https://iwgf.org/leaderboard/lattice"
          data-testid="federation-standings"
          target="_blank"
          rel="noreferrer"
        >
          Standings
        </a>,
      );
    }
    if (show('overview')) {
      push(
        <DocLink key="overview" doc="overview">
          Overview
        </DocLink>,
      );
    }
    if (show('manual')) {
      push(
        <DocLink key="manual" doc="manual">
          Intro manual
        </DocLink>,
      );
    }
    if (show('advanced')) {
      push(
        <DocLink key="advanced" doc="advanced">
          Advanced
        </DocLink>,
      );
    }
    if (show('rules')) {
      push(
        <DocLink key="rules" doc="rules">
          Official rules
        </DocLink>,
      );
    }
    if (show('handbook')) {
      push(
        <DocLink key="handbook" doc="handbook">
          Handbook
        </DocLink>,
      );
    }
    if (show('rulesTour')) {
      push(
        <Link key="tour" to="/rules" onClick={onNavigate}>
          Rules tour
        </Link>,
      );
    }
    if (show('annotate')) {
      push(
        <Link key="annotate" to="/annotate" onClick={onNavigate}>
          Annotate LPGN
        </Link>,
      );
    }
    if (show('deepLattice')) {
      push(
        <Link key="deep" to="/deep-lattice" onClick={onNavigate}>
          Deep Lattice
        </Link>,
      );
    }

    return (
      <p className={['player-docs-links', 'player-docs-links--inline', className]
        .filter(Boolean)
        .join(' ')}
      >
        {parts}
      </p>
    );
  }

  return (
    <ul
      className={['player-docs-links', 'player-docs-links--list', className]
        .filter(Boolean)
        .join(' ')}
    >
      {show('storyPage') ? (
        <li>
          <Link to="/story" onClick={onNavigate}>
            Sector 11 briefing
          </Link>
          {show('storyPdf') || show('story') ? (
            <>
              {' '}
              —
              {show('storyPdf') ? (
                <>
                  {' '}
                  <DocLink doc="storyPdf">PDF</DocLink>
                </>
              ) : null}
              {show('storyPdf') && show('story') ? ' ·' : null}
              {show('story') ? (
                <>
                  {' '}
                  <DocLink doc="story">Markdown</DocLink>
                </>
              ) : null}
              .
            </>
          ) : null}
        </li>
      ) : null}
      {show('overview') ? (
        <li>
          <DocLink doc="overview">Player overview</DocLink> — how a match feels,
          wins, and TEI.
        </li>
      ) : null}
      {show('manual') ? (
        <li>
          <DocLink doc="manual">Introductory manual</DocLink> — shorter
          walkthrough for new commanders.
        </li>
      ) : null}
      {show('advanced') ? (
        <li>
          <DocLink doc="advanced">Advanced walkthrough</DocLink> — annotated
          games for improving play.
        </li>
      ) : null}
      {show('rules') ? (
        <li>
          <DocLink doc="rules">Official rules (PDF)</DocLink> — normative
          reference for serious play.
        </li>
      ) : null}
      {show('handbook') ? (
        <li>
          <DocLink doc="handbook">Handbook</DocLink> — living docs at{' '}
          <span className="player-docs-links__host">
            {LATTICE_HANDBOOK_ORIGIN.replace(/^https:\/\//, '')}
          </span>
          .
        </li>
      ) : null}
      {show('rulesTour') ? (
        <li>
          <Link to="/rules" onClick={onNavigate}>
            Visual rules tour
          </Link>{' '}
          — in-app Sensor Net lab and breadth tour.
        </li>
      ) : null}
      {show('setupDiagram') ? (
        <li>
          <Link to="/setup-diagram" onClick={onNavigate}>
            Opening diagram
          </Link>{' '}
          — starting fleet layout.
        </li>
      ) : null}
      {show('annotate') ? (
        <li>
          <Link to="/annotate" onClick={onNavigate}>
            Annotate LPGN
          </Link>{' '}
          — paste a match, print a board report.
        </li>
      ) : null}
      {show('deepLattice') ? (
        <li>
          <Link to="/deep-lattice" onClick={onNavigate}>
            Deep Lattice
          </Link>{' '}
          — flagship AI research charter.
        </li>
      ) : null}
      {show('puzzles') ? (
        <li>
          <Link to="/puzzles" onClick={onNavigate}>
            Puzzles
          </Link>{' '}
          — thinking positions after the drills.
        </li>
      ) : null}
      {show('standings') ? (
        <li>
          <a
            href="https://iwgf.org/leaderboard/lattice"
            data-testid="federation-standings"
            target="_blank"
            rel="noreferrer"
          >
            Federation standings
          </a>{' '}
          — Lattice TEI leaderboard.
        </li>
      ) : null}
    </ul>
  );
}
