# Subspace Lattice — Agent Guide

Canonical instructions for AI assistants working in this repo. Sibling product under **IWGF**; federation overview lives at `../AGENTS.md` when this repo sits next to Warp12 in the IWGF workspace.

---

## 1. Product

**Subspace Lattice** is a two-player perfect-info strategy game: Chess piece tactics + Go-like territorial pressure via a **Sensor Net** on an **11×11** sector. Federation / fleet theme (Digital Defiance / IWGF).

- Soft-ship ruleset: **`hybrid-fleet`** (Sensor Net + sector clock + Initiative Relay). See `docs/player-overview.md` and `docs/rules.tex`.
- Wins: Surgical Strike (capture Command Hub), Sector Integration (net coverage clock), or no legal moves.
- Pieces: Command Hub, Escorts, Infiltrators, Beams. Center **Gravity Well** blocks movement. Enemy in your Sovereign Space is **Target Locked**.
- Legacy modes (`classic`, `hybrid`, `hybrid-spool`) exist for sims/tests — do not ship them as product default.
- **TEI** presentation matches Warp’s family; ratings live in **`latticeTei`** (`localAi` | `online`) — separate pool from Warp.

URLs: **lattice.iwgf.org**, standings **iwgf.org/leaderboard/lattice**, profiles **profile.iwgf.org**. Federation ops (shared with Warp): **ops.iwgf.org** (`../ops/` in the IWGF workspace).

---

## 2. Tech stack

- **Monorepo**: Nx 23 + Yarn 4 (`yarn@4.17.0`). Root `@subspace-lattice/source`. Workspaces: `packages/*`, `apps/*`.
- **Language**: TypeScript strict; package condition `@subspace-lattice/source`.
- **Frontend**: React 19, Vite 8, react-router-dom 7, Sass.
- **Backend**: Firebase project **`warp-12`** (shared with Warp). Functions codebase **`lattice`**, region `us-central1`.
- **Desktop/mobile**: Tauri 2 at `apps/desktop/src-tauri/` — shell over `apps/web`. Identifier `org.digitaldefiance.app.subspacelattice`.
- **Ratings deps**: `openskill`; TEI display helpers via `warp12-engine` / related packages where wired.
- **Test**: Vitest (co-located `*.spec.ts(x)`), Playwright (`web-e2e`), `@firebase/rules-unit-testing` for rules.

---

## 3. Structure

| Nx name | Package | Path | Role |
|---------|---------|------|------|
| `core` | `@subspace-lattice/core` | `packages/subspace-lattice` | Engine, rules, AI, sim/evolve |
| `react-ui` | `@subspace-lattice/react` | `packages/subspace-lattice-react` | Board / Lobby / Chat / Firebase hooks |
| `web` | `@subspace-lattice/web` | `apps/web` | Thin Vite host |
| `desktop` | `@subspace-lattice/desktop` | `apps/desktop` | Tauri 2 shell |
| `functions` | `@subspace-lattice/functions` | `apps/functions` | Authoritative callables |
| `web-e2e` | `@subspace-lattice/web-e2e` | `apps/web-e2e` | Playwright |

**Core layout:** `src/lib/{game-engine,rules,ai,sim,firebase,interfaces}`. Do **not** re-export Node-only CLIs from `index.ts` (breaks Vite).

**Canonical collections** (`packages/subspace-lattice/src/lib/firebase/collections.ts`):

- `latticeRoomCodes`, `latticeRooms` (+ `meta/`, `chat/`, `events/`, `presence/`)
- `latticeTei`, `latticeRatingEvents`
- Shared IWGF: `playerProfiles` (and related)

Root README collection names / “Firebase project subspace-lattice” may be **stale** — prefer `collections.ts` and `.firebaserc` (`warp-12`).

---

## 4. Commands (repo root)

```bash
yarn install
yarn emulators                 # Auth / Firestore / Functions; import/export .firebase-emulator-data
yarn serve:web                 # :4200
yarn serve:desktop             # Tauri + vite via beforeDevCommand
yarn nx run-many -t lint test build typecheck
yarn nx test core|functions|react-ui
yarn test:rules                # firestore rules via emulator
yarn test:e2e
yarn sim | yarn evolve | yarn calibrate:ai
yarn deploy:firebase           # hosting:lattice + functions:lattice ONLY
yarn ensure:functions-invoker  # after functions deploy
```

**Native / store** (see `docs/desktop-build.md`):

```bash
yarn init:desktop              # one-time ios/android gen
yarn tauri:dev | tauri:build
yarn build:mac | build:macos-appstore | build:ios-appstore
yarn build:android | build:android:apk
yarn build:windows:store       # on Windows
```

Env helper: `. scripts/lib/subspace-env.sh` → `subspace_env_load|validate` (`base|web|desktop|functions|deploy|e2e`).

---

## 5. Firebase & deploy guardrails

- **Hosting target** `lattice` → site `subspacelattice`.
- **Do not deploy Firestore from this repo.** `scripts/deploy-firebase.sh` refuses it. Merge Lattice rules into **Warp12** `firestore.rules` and deploy rules from Warp12.
- Keep the authoritative fragment in sync: this repo’s `firestore.rules` ↔ `../Warp12/firestore.rules` (Lattice section).
- Clients mostly **read**; Functions **write** rooms / moves / TEI (coach `presence` is self-write).
- Callables include: `createRoom`, `lookupRoom`, `joinRoom`, `submitMove`, `resignMatch`, `sendChat`, `setAllowObservers`, `markRoomAssisted`, `reportLatticeLocalAiMatch`, `reportLatticeOnlineMatch`. New rooms default to **`hybrid-fleet`**.
- Functions `invoker: 'private'` + post-deploy `ensure:functions-invoker` — do not switch to public invoker.
- Emulators: set `VITE_USE_FIREBASE_EMULATORS=true` only in local `.env.local`.

---

## 6. Conventions

- Strict TypeScript; game types in core `interfaces/`. Version `RulesConfig` with `rulesVersion` together.
- Online state: Functions + Firestore sync (`useGameSync`). Local AI / pass-and-play: engine in hooks.
- **Single engine** for online, local AI, tutorial, sims — no parallel rules copies.
- Shipping default changes → update `docs/player-overview.md`, in-game RulesDialog, and `docs/rules.tex` together. Promoting evolve winners needs a **human gate** (ADR 002).
- Call signs from Federation Profile — never Google `displayName`.
- Secrets / signing / `client_secret_*` are gitignored — never commit.

---

## 7. Key docs

| Path | Purpose |
|------|---------|
| `docs/player-overview.md` | Player fantasy / wins / TEI |
| `docs/desktop-build.md` | Tauri init, stores, Homebrew |
| `docs/ROADMAP.md` | Phases; academy items still open |
| `docs/rules.tex` | Normative rules |
| `docs/adr/` | Sensor Net, evolve gate, TEI, spool, clock, ties |
| `docs/playtest-fleet-checklist.md` | Fleet playtest |
| `../AGENTS.md` | IWGF federation workspace (when present) |
