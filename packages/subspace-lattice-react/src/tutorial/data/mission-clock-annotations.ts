import type { MissionAnnotations } from '../walkthrough-narrate';

/**
 * Sparse human coaching for Mission 3 (clock siege → Sector Integration).
 * Keys are absolute 1-based plies. Intro / phase cards state the win
 * condition once; ply lines name this move’s job without restamping
 * “coverage win” on every Hub shuffle.
 */
const annotations: MissionAnnotations = {
  1: {
    objective: 'Open a relay on the left.',
    why: 'White’s first Escort hop — the start of a daisy-chain off the Hub. Later Beams and Hub marches only matter if this lattice keeps linking forward.',
  },
  23: {
    objective: 'Take the tip Escort before it links deeper.',
    why: 'Capture on (4,5). Early trades here are about who still radiates: kill a relay that was about to daisy-chain, and you shrink the enemy’s future Sovereign Space.',
  },
  26: {
    objective: 'Black takes back — keep a body on the file.',
    why: 'Recapture on (6,5). Piece count looks even; the real question is whether the survivor still chains to a Hub. A dead Escort that was linking is worse than its label suggests.',
  },
  28: {
    objective: 'Move the power anchor — grow red glow.',
    why: 'Black Hub leaves the back rank. When Strike is not landing, Hub steps are territorial: the lattice expands with the flagship.',
  },
  29: {
    objective: 'Reposition a Beam inside existing glow.',
    why: 'Wide slide to (4,1). The path is already blue — White is not waiting on another Escort hop. Long Beam moves are how you redeploy once the net is built.',
  },
  33: {
    objective: 'White Hub joins so blue coverage climbs with it.',
    why: 'Hub to (6,1). Same territorial idea as Black’s march: mobile flagships, not back-rank monuments, when the endgame will be a coverage race.',
  },
  51: {
    objective: 'Punch a hole in Black’s relay with a Beam.',
    why: 'Capture on (6,5). Removing an Escort here is a coverage attack — fewer red cells — even though nobody is threatening Surgical Strike.',
  },
  57: {
    objective: 'Trade Beams off — dreadnoughts matter less now.',
    why: 'White takes on (6,7). With Beams leaving, the rest of the game is Escorts, Hubs, and who owns more Sovereign Space when ply 100 hits.',
  },
  60: {
    objective: 'Black spends an Escort to erase that Beam.',
    why: 'Recapture. Costly if that Escort was a link in the chain; cheap if it frees Black to keep Hub-walking for territory.',
  },
  73: {
    objective: 'Clear another Beam so Hub walks stay safer.',
    why: 'Escort takes on (4,6). Fewer long-range shots in the air while both Hubs keep reshaping coverage toward activation.',
  },
  100: {
    objective: 'Clock arms — coverage can now end the game.',
    why: 'Ply 100. Hold enough Sovereign Space through the opponent’s reply and you win by Sector Integration. Purple Contested Space counts for neither side — use it to break a streak. Surgical Strike is still legal; it just never arrives here.',
  },
  101: {
    objective: 'Hub step as a scoreboard move.',
    why: 'White Hub nudges blue up. After activation, flagship walks are counted in coverage, not only in king safety.',
  },
  106: {
    objective: 'Black Hub swings to claw cells back.',
    why: 'Hub to (8,5). Late replies are about stealing Sovereign Space and creating Contested cells so White cannot simply sit on a winning ratio.',
  },
  111: {
    objective: 'White Hub reclaiming — push the ratio again.',
    why: 'Hub to (2,8). The grind is: climb above the Integration line, then make the hold survive Black’s next Hub shuffle.',
  },
  115: {
    objective: 'Cross the line and hold — Sector Integration.',
    why: 'Hub to (3,7). Coverage clears the threshold and sticks. No Hub fell; saturation ended it — the reason the sector clock exists when both fleets refuse Strike.',
  },
};

export default annotations;
