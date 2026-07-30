# Subspace Lattice handbook

Player-facing notes and design docs for **Subspace Lattice**. The game itself
lives at [lattice.iwgf.org](https://lattice.iwgf.org); this site is the
readable companion to the Markdown under `docs/` in the repo.

| Start here | |
| --- | --- |
| [Player overview](./player-overview) | How a match feels, wins, TEI |
| [LPGN](./LPGN) | Lattice Portable Game Notation (match export) |
| [Sector 11 briefing](./story) | Lore + fiction ↔ mechanics glossary |
| [Illustrated story](https://lattice.iwgf.org/story) | Designed page inside the game site |
| [Official rules (PDF)](https://lattice.iwgf.org/docs/rules.pdf) | Normative reference |

## Design / ops

- [Roadmap](./ROADMAP)
- [Playtest checklist](./playtest-fleet-checklist)
- [ADRs](./adr/001-hybrid-sensor-net)
- [Desktop & store builds](./desktop-build)

Hosting: **docs.lattice.iwgf.org** (Firebase Hosting target `lattice-docs`).
Rebuild with `yarn handbook:build`; deploy with `yarn deploy:firebase:docs`.
