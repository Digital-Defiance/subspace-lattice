# Terminal Overclock — design, engine, and probes

**Status:** Implemented in engine + automated probe; player-facing copy is in
RulesDialog. Shipping `hybrid-fleet` enables the module when EMP is on.

## Fiction

Under normal operation, a Command Hub safely vents its massive excess radiation
through the Escort relay network. When a Hub initiates a Terminal Overclock,
those vents seal tight, creating a closed-loop cascade in the main drive. The
ship’s reactor enters a state of thermal runaway, packing raw, unstable energy
denser and denser by the minute. You can hold the charge to guarantee a wider
hit, but you are slowly boiling your own ship alive to do it.

The terror of this maneuver is that it is entirely visible. Both commanders can
read the ambient radiation spiking on their remaining sensors. For a captain
trying to flee, the coward's strategy of endlessly kiting the blast radius only
guarantees one outcome: when the containment field finally drops, the shockwave
will have grown large enough to blanket the entire sector. There is nowhere left
to hide.

## Mechanic

When **both** sides have **only their Command Hub** left and `terminalOverclock`
is true (and the shared phase has armed):

1. **Charge:** Hub moves add `+1` EMP charge (they no longer reset).
2. **Arming:** Uses `terminalEmpChargeTarget` if set (default **10**), else
   `empChargeTarget` (fleet multi-ship default 15).
3. **Fire:** Same turn-consuming EMP action. Blast radius starts at
   `terminalEmpRadius` if set, else `empRadius` (default 3), then grows with
   shared Terminal age (below).
4. **Thermal runaway:** Every `terminalEmpRadiusGrowthInterval` completed plies
   since the phase armed (`terminalPhaseArmedAtPly`), radius grows **+1**,
   capped at `terminalEmpRadiusMax` (default **10** = full-sector Chebyshev).
   Shipping interval **X = 5** (~15 plies to r=6 Anomaly-kite break; ~35 to
   board max).
5. **Crack / fuse:** The firer’s Hub sets `enginesFused` — no legal moves, but
   life support remains. Fused drives are **not** an instant loss for the firer.
6. **Hit:** If every remaining enemy piece is in the blast → opponent has 0
   replies → **Lockout** for the firer (even though the firer is also fused).
7. **Miss:** Opponent still has moves; after their reply, the fused firer has 0
   moves → **opponent** wins Lockout.

Multi-ship EMP is unchanged (Hub move still resets; firer is never in
`empActive`).

## Rules knobs (`RulesConfig`)

| Knob | Fleet default | Meaning |
| --- | --- | --- |
| `terminalOverclock` | `true` | Enable Phase-3 behavior |
| `terminalRequiresBothLone` | `true` | Both fleets must be lone Hubs |
| `terminalSharedPhaseClock` | `true` | Reset both charges when Phase 3 starts |
| `terminalPhaseEntryKomi` | `0` | Charge gift to side not to move (rejected at 1) |
| `terminalEmpChargeTarget` | `10` | Plies to arm while lone Hub |
| `terminalEmpRadius` | omit → `empRadius` | Optional Terminal **base** blast |
| `terminalEmpRadiusGrowthInterval` | `5` | Plies per +1 radius (0 = static). Lobby select **3–10** |
| `terminalEmpRadiusMax` | `10` | Cap growing Terminal blast |

## Engine resolution order

`fireEmp` → `endPly`: **Sector Integration** first, then `finishTurn` Lockout.
Mutual immobility after a hitting Terminal shot still awards the firer Lockout
(`finishTurn` only tests the opponent).

## How to run the probe

```bash
# From repo root
yarn nx run core:terminal-overclock-probe -- --games=40 --max-plies=120

# Or from packages/subspace-lattice
bash scripts/terminal-overclock-probe.sh --games=40 --max-plies=120
```

Writes:

- `docs/sim-runs/terminal-overclock-probe-YYYYMMDD.json`
- `docs/terminal-overclock-probe-YYYYMMDD.md` (firm answers + tables)

Unit tests: `src/lib/game-engine.terminal-overclock.spec.ts`.

## Balance dials (2026-07-31 probe + thermal runaway)

Tried in order; full table in
[`terminal-overclock-dial-ladder-20260731.md`](./terminal-overclock-dial-ladder-20260731.md).

| Dial | Result |
| --- | --- |
| 1 Both-lone only | **KEEP** — stops lone Hub Overclocking a remaining escort fleet |
| 2 Shared phase clock | **KEEP** — wipe banked charge when Phase 3 starts |
| 3 Entry komi = 1 | **REJECT** — flips White WR from ~97% to ~2.5% |
| 4 Thermal runaway (X=5) | **SHIP** — shared-age +1 radius / 5 plies, cap 10; kills soft kite |

Shipping: dials 1+2+4, komi 0. Hubs-only first-mover under Heuristic remains an open AI/tempo question, not a soft-draw problem.

## Related

- `docs/lockout-impossibility.md` §9 — EMP Lockout baseline
- ADR 002 — do not silent-edit shipping narrative without human gate
- `yarn nx run core:emp-balance` — midgame EMP radius ladder
