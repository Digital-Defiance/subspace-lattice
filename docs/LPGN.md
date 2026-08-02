# LPGN — Lattice Portable Game Notation

**Status:** draft specification (v0.2)  
**Purpose:** First-class, human-readable match export for Subspace Lattice — review by hand or paste into an AI. Inspired by chess **PGN**, not a drop-in for Lichess/Chess.com.

Machine/debug dumps remain JSON (`subspace-lattice-debug-v1`). LPGN is the **player-facing** format.

---

## 1. Design principles

1. **Look like PGN** — tagged headers, then numbered plies, then a result token.
2. **Chess piece letters** — Lattice units already map to chess glyphs (see §3).
3. **11×11 coordinates** — files `a`–`k`, ranks `1`–`11` (see §4).
4. **Oddballs are explicit plies** — **EMP**, **Terminal Overclock (TEMP)**, and **spool** are not piece moves; they get dedicated tokens (§6).
5. **Gravity Well is silent** — center `(5,5)` / `f6` is impassable terrain. It never appears as a destination; no special token.
6. **Resign is chess-normal** — result tags + optional comment; no special move glyph required.

LPGN is **not** guaranteed loadable by fairy-chess tools. Piece letters match chess; board size, Sensor Net law, EMP, Terminal Overclock, and spool do not.

---

## 2. File shape

```text
[Event "Local vs AI"]
[Site "lattice.iwgf.org"]
[Date "2026.07.29"]
[White "Alex"]
[Black "Lattice AI (Normal)"]
[Result "1-0"]
[Rules "hybrid-fleet"]
[Mode "local-ai"]
[HeavyWing "standard"]
[SectorClock "100"]
[EmpRadius "3"]
[EmpCharge "15"]
[EmpBlackout "1"]
[TerminalOverclock "1"]
[TerminalBothLone "1"]
[TerminalSharedClock "1"]
[TerminalEmpCharge "10"]
[TerminalGrowth "5"]
[TerminalRadiusMax "10"]
[InfiltratorSpool "0"]
[InfiltratorUnlock "0"]

1. pe5e6 ne7d5 2. EMP@f1/r3 Nd5f6 3. rf2f8 1-0
```

- Headers: one `[Tag "value"]` per line (PGN style).
- Body: blank line after headers, then move text, then result.
- Encoding: UTF-8. Line endings: LF preferred.
- Suggested extension: **`.lpgn`** (also acceptable: `.pgn.txt`).

---

## 3. Piece letters

Same mapping as `pieceTypeChessSymbolMap` in core:

| Lattice unit   | Letter (SAN-style) | Chess analogue |
| -------------- | ------------------ | -------------- |
| Command Hub    | `K` / `k`          | King           |
| Carrier        | `Q` / `q`          | Queen          |
| Beam           | `R` / `r`          | Rook           |
| Refractor      | `B` / `b`          | Bishop         |
| Infiltrator    | `N` / `n`          | Knight         |
| Escort         | `P` / `p`          | Pawn           |

In **move text**, use the **uppercase** letter of the moving side’s piece type (PGN convention: piece kind, not color). Escorts may omit `P` in a future terse dialect; **v0.1 requires the letter** for every piece move so 11×11 dumps stay unambiguous.

Color is implied by whose turn the ply number belongs to (White on odd half-moves in the usual `1. White Black` pairing — see §7).

---

## 4. Board coordinates

Engine coordinates: integer `x` (file), `y` (rank), origin at White’s lower-left.

| Engine | LPGN |
| ------ | ---- |
| `x = 0 … 10` | files `a` … `k` |
| `y = 0 … 10` | ranks `1` … `11` |
| Gravity Well `(5,5)` | `f6` (never a legal destination) |

Square token: **file + rank**, e.g. `e2`, `k11`, `a1`.

Conversion:

- file char = `'a' + x`
- rank text = `String(y + 1)`

White’s home rank is `y = 0` → rank **1**. Black’s home rank is `y = 10` → rank **11**.

---

## 5. Required & optional headers

### Required

| Tag | Meaning |
| --- | --- |
| `Event` | Short match label (`Pass & Play`, `Local vs AI`, room name, …) |
| `Site` | `lattice.iwgf.org` or `offline` / app build id |
| `Date` | `YYYY.MM.DD` (UTC date of export or game start) |
| `White` | Display name / call sign |
| `Black` | Display name / call sign / `Lattice AI (…)` |
| `Result` | `1-0` · `0-1` · `*` (unterminated) |
| `Rules` | Engine `rulesVersion` (`hybrid-fleet`, `hybrid-spool`, …) |

### Strongly recommended (fleet)

| Tag | Meaning |
| --- | --- |
| `Mode` | `local-ai` · `pass-and-play` · `online` · `tutorial` |
| `HeavyWing` | `standard` · `refractor-wing` · `fleet-draft` |
| `SectorClock` | `sectorActivationPly` (integer) |
| `EmpRadius` | Chebyshev radius (`0` = EMP off) |
| `EmpCharge` | charge target plies (`0` = off) |
| `EmpBlackout` | enemy reply plies frozen |
| `TerminalOverclock` | `0` / `1` — Phase 3 module on |
| `TerminalBothLone` | `0` / `1` — both fleets must be lone Hubs |
| `TerminalSharedClock` | `0` / `1` — charges reset when Phase 3 arms |
| `TerminalEmpCharge` | plies to arm while Overclocking |
| `TerminalGrowth` | plies per +1 blast radius (`0` = static) |
| `TerminalRadiusMax` | Chebyshev cap on growing Terminal blast |
| `TerminalEmpRadius` | optional Terminal **base** radius when ≠ `EmpRadius` |
| `InfiltratorSpool` | `0` / `1` (navigational announce on) |
| `InfiltratorUnlock` | plies before infiltrators activate |

### Optional

| Tag | Meaning |
| --- | --- |
| `Termination` | `hub-capture` · `sector-integration` · `no-moves` · `resign` (mirrors `winnerReason`) |
| `Sector` | online room code |
| `TEI` | `rated` · `casual` · `assisted` |
| `PlyCount` | final `plyCount` |
| `LPGN` | format version, e.g. `0.2` |

Unknown tags must be preserved by exporters/importers that round-trip.

---

## 6. Ply tokens

Whitespace-separated tokens. One **logical ply** = one token (or one token + optional brace comment).

### 6.1 Piece move (normal)

```text
<Piece><from><to>
<Piece><from>x<to>
```

Examples:

- `pe5e6` — Escort `e5` → `e6`
- `Nf3d4` — Infiltrator jump/crawl `f3` → `d4`
- `Re2xe8` — Beam captures on `e8`
- `Kd1e1` — Hub step

Capture: insert `x` between from and to when a piece was removed (`MoveInfo.capturedType` set). Capturing the Hub ends the game (`Termination "hub-capture"`); still record the capturing ply.

Disambiguation: **always include from-square** in v0.1 (no SAN-style file-only shortcuts).

### 6.2 Spool announce (hybrid-spool / module on)

Infiltrator paints a navigational target without moving:

```text
N@<from>-><target>
```

Example: `N@c2->f5` — Infiltrator on `c2` announces warp to `f5` (`spoolAnnounce`).

### 6.3 Spool execute

Same as a normal Infiltrator move to the announced square (or elsewhere if rules allow). Prefer:

```text
N<from><to>
```

Optional comment `{spool}` when the move completes a prior announce.

### 6.4 Spool failed

Announce cleared / jump aborted without a board move:

```text
N@<from>--
```

Example: `N@c2--` (`spoolFailed`).

### 6.5 EMP / Command Overload

Not a piece move. Fire from the Hub’s square (blast origin). Emit the live
Chebyshev radius after `/r`:

```text
EMP@<hubSquare>/r<radius>
```

Example: `EMP@f1/r3` — White Hub on `f1` detonates midgame EMP (`empFired`).

Legacy v0.1 tokens without `/rN` (`EMP@f1`) remain readable; exporters should
always include radius when known.

### 6.6 Terminal Overclock (TEMP)

Lone-Hub Phase 3 fire. Same geometry as EMP, but the firer’s Hub drives fuse
(`enginesFused`) and the radius may have grown with shared Terminal age:

```text
TEMP@<hubSquare>/r<radius>
```

Example: `TEMP@c2/r4` — Terminal Overclock from `c2` with blast radius 4.

Importers: treat `TEMP@` like `EMP@` for board replay, then mark the firer’s
Hub fused. Lockout still only tests the **opponent’s** replies after the ply
(mutual immobility awards the firer).

### 6.7 Pass / null

Unused in shipping rules. Reserved: `--`.

---

## 7. Move numbering

PGN-like pairing:

```text
1. <WhitePly> <BlackPly> 2. <WhitePly> <BlackPly> …
```

- Integer before `.` is the **move number** (White’s turn index), not engine `plyCount`.
- After an odd number of plies, Black’s half is omitted and the result follows.
- Engine `plyCount` starts at 0 before any move; LPGN move `1.` is the first White ply.

Example (White resigns after Black’s first reply):

```text
1. pe5e6 ne7e6 2. Kd1e1 0-1
```

with `[Termination "resign"]`.

---

## 8. Results & termination

| Result | Meaning |
| ------ | ------- |
| `1-0` | White won |
| `0-1` | Black won |
| `*` | In progress / aborted without result |

Map `winnerReason` into `Termination` when known:

| `winnerReason` | Typical Result | Notes |
| -------------- | -------------- | ----- |
| `hub-capture` | winner’s `1-0` / `0-1` | Surgical Strike |
| `sector-integration` | winner’s | Sector clock |
| `no-moves` | winner’s | Lockout (often after `EMP@` / `TEMP@`) |
| `resign` | opponent’s | Chess-normal |

Brace comments are allowed anywhere a PGN comment would be:

```text
1. pe5e6 {relay} EMP@f1/r3 {overload} 1-0
```

---

## 9. What LPGN deliberately omits (v0.2)

These matter in play but are **reconstructible** from a legal move list + starting setup + rules headers, or belong in JSON debug exports:

- Live Sensor Net masks / Target Lock highlights every ply
- EMP charge counters tick-by-tick (final headers optional)
- Terminal phase age ply-by-ply (radius is on each `TEMP@` / grown `EMP@` token)
- Clock coverage percentages
- Advisor / assisted flags beyond `TEI`
- Absolute timestamps (optional future tag)

Exporters **may** add `{lock}` comments when a piece becomes Target Locked; readers must not require them.

---

## 10. Starting position

Default shipping setup is implied by `Rules` + `HeavyWing` (Initiative Relay, wing files, etc.). LPGN does **not** require an embedded FEN.

Optional future tag:

```text
[FEN "<lattice-fen-v1>"]
```

Lattice-FEN (sketch only; not normative yet): 11 ranks `/`-separated, chess letters, Gravity Well as `*` or `X`, side to move, spool targets as ep-like field — TBD in a later revision.

---

## 11. Minimal complete example

```text
[Event "Pass & Play"]
[Site "offline"]
[Date "2026.07.29"]
[White "Alex"]
[Black "Blake"]
[Result "1-0"]
[Rules "hybrid-fleet"]
[Mode "pass-and-play"]
[LPGN "0.2"]
[Termination "hub-capture"]
[HeavyWing "standard"]
[SectorClock "100"]
[EmpRadius "3"]
[EmpCharge "15"]
[EmpBlackout "1"]
[TerminalOverclock "1"]
[TerminalBothLone "1"]
[TerminalSharedClock "1"]
[TerminalEmpCharge "10"]
[TerminalGrowth "5"]
[TerminalRadiusMax "10"]
[InfiltratorSpool "0"]
[InfiltratorUnlock "0"]

1. pe5e6 pe7e6 2. Nd3e5 pe6e5 3. Ne5xd7 1-0
```

(Illustrative plies only — not a real engine transcript.)

Spool + EMP flavored fragment:

```text
…
12. N@c2->f5 Rd8d5 13. N@c2-- pe7e6 14. EMP@f1/r3 Nd5f4 15. Ke1f1 0-1
```

Terminal Overclock finish:

```text
…
40. Kc3c2 kd8d7 41. TEMP@c2/r4 1-0
```

with `[Termination "no-moves"]` (Lockout; firer fused, opponent had zero replies).

Exporters live in `@subspace-lattice/core` (`formatLpgn`, `formatLpgnPlyToken`,
`diffStatesToLpgnEntry`). Local AI / pass-and-play attach `MoveInfo.empRadius`
and `MoveInfo.terminalEmp` when `fireEmp` succeeds; online sync infers
`terminal-emp` when the firer’s Hub is `enginesFused` after `empActive` appears.

---

## 12. Relationship to debug JSON

| | LPGN | `subspace-lattice-debug-v1` |
| --- | --- | --- |
| Audience | Players, coaches, AI chat | Engineering / replay tooling |
| Format | Text | JSON |
| Moves | Algebraic tokens | Structured `moveLog` + states |
| Full board snapshots | Optional later FEN | `initialState` + `gameState` |

A good product export offers **LPGN by default** on match finish (**Save match log**)
and may still offer JSON for bugs (triple-click the match title).

---

## 13. Versioning

- **LPGN 0.2** (this document): Terminal Overclock headers; `EMP@sq/rN` and
  `TEMP@sq/rN` ply tokens; `terminal-emp` in debug move logs.
- **LPGN 0.1**: midgame EMP as `EMP@sq` without `/rN`; no Terminal tags.
- Breaking token/header changes bump the minor or major version in `[LPGN "…"]`.
- Implementations should accept unknown headers and unknown `{comments}`.

---

## 14. Annotate LPGN → PDF (replay pipeline)

Player-facing export is write-only until you want coaching. Core now ships a
**read path**:

| Step | API / command | Role |
| --- | --- | --- |
| Parse | `parseLpgn` | Headers + ply tokens |
| Replay | `replayLpgn` | Apply on the real engine from `[Rules]` / `[HeavyWing]` |
| Annotate | `annotateLpgnReplay` | Facts, mate-in-1/2 shortcuts, EMP/net coaching branches, **advisor why + heuristic optimality** |
| Board capture | `yarn capture:lpgn-figures` | Playwright → live `Board` SVG (Sensor Net, EMP/TO, piece art) |
| TeX/PDF | `yarn annotate:lpgn <file.lpgn>` | Writes `docs/lpgn-reports/<id>/` |

Each ply gets:

- **Why (both seats)** — strategic plan (`explainStrategicIntent`: build screen,
  liquidate, sector race, Hub hunt, …) plus tactical notes (`explainAdvisorMove`).
- **Optimality (your seat only)** — 1-ply eval shortlist + `suggestAdvisorMove`
  tip when search disagrees. Opponent plies are explained, not graded.

```bash
yarn annotate:lpgn path/to/game.lpgn --advisor normal
yarn annotate:lpgn path/to/game.lpgn --advisor strong
```

```bash
yarn annotate:lpgn path/to/game.lpgn
# captures Board diagrams (default), then pdflatex

yarn annotate:lpgn path/to/game.lpgn --every-ply
yarn annotate:lpgn path/to/game.lpgn --force-capture   # redo SVGs
yarn annotate:lpgn path/to/game.lpgn --letter-svg       # offline glyph fallback (no net/EMP art)
yarn capture:lpgn-figures -- --lpgn path/to/game.lpgn --plies 29,37,75
```

Requires Playwright chromium (via `@playwright/test`), a Vite web app, plus
`rsvg-convert` + `pdflatex` for PDF. Harness: `/harness/lpgn-figures`.

### Client-side annotate (no server CPU)

Open **`/annotate`** in the web app (or desktop shell). Paste / upload LPGN,
pick your seat + advisor strength, and run grading **in the browser**. A
percentage bar updates as each ply yields to the event loop; when finished,
use **Print / Save as PDF** for a printable HTML report with live Board
diagrams (key positions by default).

This is the player-facing path so annotation CPU stays on the client. The
Node + Playwright pipeline above remains for handbook / content-factory PDFs.

**Why Board capture:** letter SVGs are fine for legality debugging; coaching
PDFs need the player's Subspace Lattice piece pack, Sensor Net sovereign
colours, and EMP / Terminal Overclock blast colouring.

**Scorer (next):** once replay is trusted, compare each ply to Heuristic/MCTS
top move (`yarn sim` consumer) for AI regression corpora.

---

## See also

- [`docs/player-overview.md`](./player-overview.md) — wins and fantasy
- [`docs/content-factory.md`](./content-factory.md) — drills / puzzles from matches
- [`docs/rules.tex`](./rules.tex) — normative rules (Gravity Well, spool, EMP, Terminal)
- [`docs/terminal-overclock.md`](./terminal-overclock.md) — Terminal design pointer
- [`docs/adr/004-infiltrator-spool.md`](./adr/004-infiltrator-spool.md) — spool design
- Core: `pieceTypeChessSymbolMap`, `MoveInfo`, `WinnerReason`, `parseLpgn`, `replayLpgn`
