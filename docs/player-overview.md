# Subspace Lattice — for players

Subspace Lattice is a two-player strategy game on an 11×11 sector grid. It
mixes the piece-by-piece tactics of chess with the growing territorial pressure
of a relay network: you maneuver a small fleet while extending a **Sensor Net**
across the board.

You are not racing to paint the map. You are hunting the enemy **Command Hub**
while the net makes turtling forever impossible.

---

## The fantasy

Each side commands eight ships:

| Piece | Role |
| --- | --- |
| **Command Hub** | Your king and your radio tower — protect it, project influence |
| **Escorts** | Close-range movers that **relay** the Sensor Net when linked |
| **Infiltrators** | Long-range gap attackers that warp outside the enemy net |
| **Beams** | Line pieces that may only fire along your own net |

Friendly pieces link within two spaces of each other. Escorts connected to the
hub expand your **Sovereign Space**. An enemy standing inside that space is
**Target Locked**: special systems shut down and they may only step one square
orthogonally.

The center **Gravity Well** blocks movement. Nothing may occupy or cross it.

---

## How you win

1. **Surgical Strike** — capture the enemy Command Hub.  
   This is the primary payoff: tactics, traps, and tempo.

2. **Sector Integration** — cover enough of the sector with your Sensor Net.  
   This is the **endgame clock**. If both fleets dig into permanent defense,
   territory eventually forces the issue. It is meant to be a late pressure
   valve, not the usual way to win.

3. **No legal moves** — leave the opposing fleet with nothing it can do.

Online play and local AI use these **hybrid-fleet** rules (Sensor Net plus the
sector clock and Initiative Relay). A legacy chess-like **classic** mode and
the older instant-sector **hybrid** mode exist for tools and regression tests.

---

## How a game feels

Early game: deploy, link escorts, contest the mid-board. Infiltrators look for
gaps outside the enemy net. Beams need your own coverage before they matter.

Midgame: Target Locks punish overextension. Hub hunts and net fights trade
blows. Good play looks like fleet tactics with a growing radio picture — not a
pure Go race.

Late game: if the hubs still stand, Sector Integration tightens. Someone has to
break the stalemate or accept the clock.

---

## Skill rating

Digital strength uses **TEI** (Tactical Efficiency Index) — the same
presentation family as Warp 12 — so ratings read across related titles. TEI is
how the client shows skill; under the hood it is calibrated from self-play
ladders, not a vanity score. Local AI and rated online matches write separate
tracks in `latticeTei` (`localAi` and `online`).

---

## Where to look next

| Audience | Document |
| --- | --- |
| New / casual players | Introductory manual (`/docs/subspace-lattice-manual.pdf` on the site) |
| In-game summary | Rules dialog in the client |
| Normative / serious rules | [`docs/rules.pdf`](./rules.pdf) (`/docs/rules.pdf` on the site) |
| Opening diagram | `/setup-diagram` in the web app |
| Viability / what we tested | [`docs/game-viability-testing.md`](./game-viability-testing.md) |
| Design / balance lab (developers) | [`packages/subspace-lattice/docs/evolution-lab.md`](../packages/subspace-lattice/docs/evolution-lab.md) |

Online play and local AI soft-ship **hybrid-fleet** (Integration Hold, Contested
Space, late activation, Initiative Relay). Legacy **hybrid** / **classic** remain
for sims. When shipping defaults change, update this overview, the in-game Rules
dialog, and `rules.tex` together.
