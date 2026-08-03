import { defineConfig } from 'vitepress';

/**
 * Handbook site for docs/*.md → Firebase Hosting target `lattice-docs`
 * (docs.lattice.iwgf.org). Source of truth stays in repo-root `docs/`.
 */
export default defineConfig({
  title: 'Subspace Lattice',
  description:
    'Deep Lattice, Sector 11 briefing, player overview, and design notes',
  // Content lives in the monorepo docs/ tree (not under apps/handbook).
  srcDir: '../../docs',
  outDir: './dist',
  cleanUrls: true,
  // Repo-relative links (../packages/…, localhost harness URLs) are fine in
  // source Markdown but are not handbook routes.
  ignoreDeadLinks: true,
  themeConfig: {
    siteTitle: 'Subspace Lattice',
    nav: [
      { text: 'Play', link: 'https://lattice.iwgf.org/play' },
      { text: 'Deep Lattice', link: '/deep-lattice' },
      { text: 'Atlas', link: '/lattice-atlas' },
      { text: 'Overview', link: '/player-overview' },
      { text: 'Briefing', link: '/story' },
    ],
    sidebar: [
      {
        text: 'Players',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Deep Lattice', link: '/deep-lattice' },
          { text: 'Player overview', link: '/player-overview' },
          { text: 'Sector 11 briefing', link: '/story' },
          { text: 'LPGN', link: '/LPGN' },
          { text: 'Playtest checklist', link: '/playtest-fleet-checklist' },
        ],
      },
      {
        text: 'Lattice Atlas',
        items: [
          { text: 'Atlas home', link: '/lattice-atlas' },
          { text: 'Opening', link: '/atlas/opening' },
          { text: 'Pieces & wings', link: '/atlas/pieces' },
          { text: 'Win paths', link: '/atlas/win-paths' },
          { text: 'Clocks & Terminal', link: '/atlas/clocks' },
          { text: 'AI & measurement', link: '/atlas/measurement' },
          { text: 'Census (generated)', link: '/atlas/census' },
        ],
      },
      {
        text: 'Documents (PDF)',
        items: [
          {
            text: 'Official rules',
            link: 'https://lattice.iwgf.org/docs/rules.pdf',
          },
          {
            text: 'Introductory manual',
            link: 'https://lattice.iwgf.org/docs/subspace-lattice-manual.pdf',
          },
          {
            text: 'Advanced manual',
            link: 'https://lattice.iwgf.org/docs/advanced-manual.pdf',
          },
          {
            text: 'Sector 11 story',
            link: 'https://lattice.iwgf.org/docs/story.pdf',
          },
        ],
      },
      {
        text: 'Design notes',
        items: [
          { text: 'Roadmap', link: '/ROADMAP' },
          { text: 'Deep Lattice lab', link: '/deep-lattice-lab' },
          { text: 'Lockout impossibility', link: '/lockout-impossibility' },
          { text: 'Terminal Overclock', link: '/terminal-overclock' },
          { text: 'Game viability', link: '/game-viability-testing' },
          { text: 'Desktop / store build', link: '/desktop-build' },
          { text: 'Handbook hosting', link: '/handbook-hosting' },
          { text: 'ADR 001 — Sensor Net', link: '/adr/001-hybrid-sensor-net' },
          { text: 'ADR 002 — Evolve gate', link: '/adr/002-evolution-human-gate' },
          { text: 'ADR 003 — TEI', link: '/adr/003-tei-grades' },
          { text: 'ADR 004 — Infiltrator spool', link: '/adr/004-infiltrator-spool' },
          { text: 'ADR 005 — Sector clock', link: '/adr/005-functional-clock-gate' },
          { text: 'ADR 006 — Sector ties', link: '/adr/006-color-neutral-sector-ties' },
          { text: 'ADR 007 — Deep Lattice neural', link: '/adr/007-deep-lattice-neural' },
        ],
      },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/Digital-Defiance/subspace-lattice',
      },
    ],
    footer: {
      message: 'Interstellar Warp Gaming Federation · Digital Defiance',
      copyright: 'Play at lattice.iwgf.org',
    },
    search: {
      provider: 'local',
    },
  },
});
