import type { MissionAnnotations } from '../walkthrough-narrate';

/**
 * Sparse human coaching for Mission 2 (standard battle → Surgical Strike).
 * Keys are absolute 1-based plies. Quiet unmarked plies stay short callouts —
 * do not stamp "hunting the Hub" on every Escort hop.
 *
 * Voice: name the immediate job of *this* move. The episode intro / phase
 * cards already say White is playing for Surgical Strike.
 */
const annotations: MissionAnnotations = {
  1: {
    objective: 'Park the left Beam where a future lane can live.',
    why: 'White climbs the left Beam off the back rank. Beams cannot invent a path — they only slide inside Sensor Net — so parking now means the dreadnought is already on a file when Escorts later grow the glow toward Black.',
  },
  2: {
    objective: 'Black answers the same parking idea.',
    why: 'Black mirrors on the opposite wing. Same logic: get the long-range piece onto a file before the Escorts start laying relays.',
  },
  3: {
    objective: 'Park the right Beam too.',
    why: 'White’s second Beam leaves the corner. Corner Beams are stranded until coverage arrives; mid-file parking is cheaper tempo once the relay chain starts.',
  },
  4: {
    objective: 'Black aims a Beam at the Hub file.',
    why: 'Black swings onto column 5 — the file Black’s own Hub sits on, and the one White will eventually need to contest. Central Beams matter once anyone’s net reaches midboard.',
  },
  5: {
    objective: 'White bookends the center files.',
    why: 'White tucks onto column 6 beside the Hub file. Two Beams flanking the center means whichever Escort chain grows first already has a rider waiting.',
  },
  7: {
    objective: 'White doubles onto the capture files.',
    why: 'Left Beam steps to column 4. White now owns the two files most likely to become Hub-hunt lanes once coverage stretches forward — not attacking yet, just choosing where the shot will come from.',
  },
  8: {
    objective: 'Black finishes Beam parking.',
    why: 'Black’s last Beam joins column 6. Opening placement is done; the next job belongs to Escorts, who actually grow the nets those Beams will ride.',
  },
  9: {
    objective: 'Start the relay that feeds those Beams.',
    why: 'First Escort hop. Escorts are the only ships that push Sensor Net into unmapped dark — without this chain, the parked Beams stay boxed in their starting glow.',
  },
  12: {
    objective: 'Black Hub buys coverage with a step.',
    why: 'Black’s Hub edges forward. The Hub is the net’s power anchor, so this is not king-walking for its own sake — red coverage jumps because the whole lattice moves with the flagship.',
  },
  13: {
    objective: 'Spend the Initiative Relay on midboard glow.',
    why: 'White’s forward Escort (the first-mover’s extra relay) steps to (5,4). That is the point of the Relay: early midboard coverage so White’s Beams get lanes before Black can match.',
  },
  15: {
    objective: 'Ride the new glow, don’t wait on the back rank.',
    why: 'White’s Beam slides to (6,5) because the Escort chain finally covers the path. The advance is the payoff for plies 9–13 — Beams only move when the net lets them.',
  },
  16: {
    objective: 'Black puts a Beam in the scrap.',
    why: 'Black answers on (5,6). Midboard Beams are there to punish an overextended Escort or to sit on a file the enemy Hub might wander onto.',
  },
  17: {
    objective: 'Push the left Beam — accept a temporary net dip.',
    why: 'White’s column-4 Beam reaches (4,5). Coverage dips briefly because the piece left a square the net was using; the bet is Escorts will re-link before Black can exploit the hole.',
  },
  19: {
    objective: 'Re-link after the Beam hop.',
    why: 'Escort to (4,2) snaps blue coverage back. This is the usual repair job after a Beam advance: reconnect the daisy-chain so the forward dreadnought stays fed.',
  },
  26: {
    objective: 'Black’s tip Escort finally locks something.',
    why: 'Escort to (4,6) puts a White ship under Target Lock. Locks are the midgame punishment for standing in enemy glow — a locked Beam crawls one step and stops being a long-range threat.',
  },
  27: {
    objective: 'Cut the relay tip that made the lock.',
    why: 'White’s Beam takes that Escort. Removing the tip both lifts the lock and clears a square on the file White wants open for the Hub hunt.',
  },
  28: {
    objective: 'Black refuses to leave the file empty.',
    why: 'Black Beam recaptures. Trading a Beam for an Escort is often fine for White — Escorts carry net, Beams only ride it — but Black at least clears the immediate taker.',
  },
  31: {
    objective: 'Walk the Hub up so the whole net climbs with it.',
    why: 'White Hub leaves the back rank. Flagship steps expand Sovereign Space for every linked Escort; blue coverage jumps because the power anchor moved, not because a random Escort painted a cell.',
  },
  32: {
    objective: 'Black does the same — Hubs become active pieces.',
    why: 'Black Hub to (6,8). Once both flagships are mobile, coverage races and Target Locks appear; the board is no longer two back-rank museums.',
  },
  33: {
    objective: 'Keep the Hub march — influence, not mate yet.',
    why: 'White Hub to (6,2). Nets sit even. The march is still about owning the center files so Escorts and Beams can force Black’s Hub into a bad square later.',
  },
  35: {
    objective: 'Own the center glow — now the hunt can start.',
    why: 'Hub to (6,3): blue leaps to 49 cells and two ships lock. That spike is what turns setup into a Hub hunt — White’s lattice finally covers the files Black’s Hub has to live on.',
  },
  37: {
    objective: 'Put an Escort under the Hub so the forward net cannot collapse.',
    why: 'Escort to (6,4). A forward Hub without a linked relay is a coverage mirage — one capture unplugs half the glow. This Escort is insurance for the march.',
  },
  40: {
    objective: 'Black strips a White Beam off the Hub file.',
    why: 'Capture on (6,5). With dreadnoughts trading, the fight shifts to who still has Escorts holding the chain — those are what keep the Hub hunt (or the defense) alive.',
  },
  41: {
    objective: 'Recapture and stay on the climb file.',
    why: 'White Escort takes back. The point is not the piece count — it is keeping a friendly body on the file White’s Hub is climbing so Black cannot plant there for free.',
  },
  47: {
    objective: 'Remove Black’s last central Beam.',
    why: 'Escort takes on (6,6). No Black dreadnought left hanging over the Hub file means White can press the Hub without a Beam shot answering from midboard.',
  },
  48: {
    objective: 'Black takes back — still has a Hub to shelter.',
    why: 'Recapture. Coverage dips, but Black’s real problem is screen thickness around the Hub, not the trade itself.',
  },
  50: {
    objective: 'Black Hub steps into the scrap — raises Strike risk.',
    why: 'Hub to (6,7). Equal nets, but every step toward White’s Escorts makes Surgical Strike one mistake away. Bold when you need coverage; fatal if the screen is thin.',
  },
  55: {
    objective: 'Peel the last Escort off Black’s Hub.',
    why: 'White takes on (6,5). Thin the screen first; the Hub itself is next if Black walks onto a square White already attacks.',
  },
  56: {
    objective: 'Black Hub steps onto a square White can take.',
    why: 'Hub to (6,6) — en prise. Hub safety outranks every other plan. This single step hands White the Surgical Strike the whole opening was built to deliver.',
  },
  57: {
    objective: 'Take the Hub — Surgical Strike.',
    why: 'Escort captures the Command Hub. Game over. The Beam parking, relay chain, Hub march, and trades were all scaffolding for this one capture.',
  },
};

export default annotations;
