# Fleet rules playtest checklist (`hybrid-fleet`)

Soft-shipped as the default for **local AI** and **new online rooms**.
Do not promote as the only documented “official hybrid” until this list is green.

## Setup visibility

- [ ] Opening board shows White’s extra Initiative Relay Escort at forward position (linked through central Escort).
- [ ] Black’s setup remains the mirrored 8-piece fleet.
- [ ] Objective HUD shows sector clock **disarmed** until ply 100 (activation).
- [ ] Rules dialog / log mentions `hybrid-fleet` (or “fleet”).

## Contested Space

- [ ] Overlapping Sensor Net cells count for **neither** side’s coverage %.
- [ ] Projecting into the opponent’s net can stall / reset their Integration Hold streak.

## Integration Hold + activation

- [ ] Before ply 100: coverage ≥ ρ does **not** win and streaks do not accrue.
- [ ] At/after ply 100: reaching ρ starts/continues a 1-ply hold; opponent can break on their reply.
- [ ] Simultaneous both-at-threshold: no instant double-win (ADR 006).

## Feel of the relay

- [ ] White’s early midboard presence feels like compensation, not a free win.
- [ ] Hub-hunt still decides a large share of games (sector ~25–40% of decided sims).
- [ ] Fast / Normal / Strong AI remain ordered (Strong hardest).

## Rating / standings

- [ ] Signed-in local AI win/loss updates TEI and appears on `/leaderboard`.
- [ ] Replay of the same `eventId` does not double-count.
- [ ] Fast / Normal / Strong labeled **P0 / I10 / I52** in UI copy.

## Promote when

- [ ] ≥5 human games with no “broken” or confusing clock moments.
- [ ] No regression vs shipping `hybrid` on Surgical Strike clarity.
- [ ] Update `docs/rules.tex` title/defaults to `hybrid-fleet` and rebuild PDF.
