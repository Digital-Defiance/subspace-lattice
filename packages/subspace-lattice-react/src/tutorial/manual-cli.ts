/// <reference types="node" />
/**
 * Advanced-manual generator (node-only; bundled by scripts/build-advanced-manual.sh).
 *
 * Replays all three guided missions ply by ply with the real engine, merges
 * the academy narration with computed facts (captures, net sizes, Target
 * Locks, hub threats), and emits docs/advanced-manual.tex — four board
 * diagrams per page, every move explained.
 *
 * Figures come from scripts/capture-mission-figures.mjs
 * (docs/figures/missions/<id>/ply-NNN.svg → .pdf via build script).
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  findHubCaptureMove,
} from '@subspace-lattice/core';
import { buildManualMissions, type ManualMission } from './manual-missions';
import { isEmpTutorialMove } from './tutorial-types';

const PIECE_LABEL: Record<string, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

/** Escape LaTeX specials + normalize typographic punctuation in prose. */
function tex(input: string): string {
  return input
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u201c/g, '``')
    .replace(/\u201d/g, "''")
    .replace(/\u2014/g, '---')
    .replace(/\u2013/g, '--')
    .replace(/\u00d7/g, '$\\times$')
    .replace(/\u2265/g, '$\\geq$')
    .replace(/\u2248/g, '$\\approx$')
    .replace(/\u03c1/g, '$\\rho$');
}

const pad = (n: number) => String(n).padStart(3, '0');

interface PlyAnnotation {
  heading: string;
  body: string;
}

function annotateMission(mission: ManualMission): PlyAnnotation[] {
  const engine = SubspaceLatticeEngine.fromState(
    mission.createState(),
    mission.rules,
  );
  const notes: PlyAnnotation[] = [];

  for (let i = 0; i < mission.steps.length; i++) {
    const step = mission.steps[i]!;
    const move = step.playerMove;

    if (isEmpTutorialMove(move)) {
      const seatName =
        engine.getState().currentPlayer === PlayerColor.Black
          ? 'Black'
          : 'White';
      if (!engine.fireEmp()) {
        throw new Error(`${mission.id}: illegal EMP at ply ${i + 1}`);
      }
      const state = engine.getState();
      const facts: string[] = ['Command Overload (EMP)'];
      if (state.winner) {
        facts.push(
          `\\textbf{${state.winner === 'WHITE' ? 'White' : 'Black'} wins}`,
        );
      }
      notes.push({
        heading: `Ply ${i + 1} --- ${seatName} Command Overload (EMP)`,
        body: `${tex(step.why)}\\; {\\color{gray}\\scriptsize [${facts.join(' \\,\\textbullet\\, ')}]}`,
      });
      continue;
    }

    const mover = engine.getPiece(move.pieceId);
    if (!mover) throw new Error(`${mission.id}: missing piece at ply ${i + 1}`);
    const seatName = mover.owner === PlayerColor.Black ? 'Black' : 'White';
    const label = PIECE_LABEL[mover.type] ?? 'ship';
    const from = `(${mover.position.x},${mover.position.y})`;
    const to = `(${move.to.x},${move.to.y})`;
    const target = engine.getPieceAt(move.to);
    const capture = target ? PIECE_LABEL[target.type] ?? 'ship' : null;

    if (!engine.movePiece(move.pieceId, move.to)) {
      throw new Error(`${mission.id}: illegal replay move at ply ${i + 1}`);
    }

    const state = engine.getState();
    const facts: string[] = [];
    if (capture) facts.push(`captures ${capture}`);
    const whiteNet = engine.getSensorNetSet(PlayerColor.White).size;
    const blackNet = engine.getSensorNetSet(PlayerColor.Black).size;
    facts.push(`net ${whiteNet}--${blackNet}`);
    const locked = Object.values(state.pieces).filter((p) =>
      engine.isPieceDetected(p),
    ).length;
    if (locked > 0) facts.push(`${locked} ship${locked === 1 ? '' : 's'} locked`);
    if (state.winner) {
      facts.push(`\\textbf{${state.winner === 'WHITE' ? 'White' : 'Black'} wins}`);
    } else if (findHubCaptureMove(engine)) {
      // Side to move can take the enemy Hub right now.
      facts.push('\\textbf{Hub en prise!}');
    }

    notes.push({
      heading: `Ply ${i + 1} --- ${seatName} ${label} ${from}$\\rightarrow$${to}`,
      body: `${tex(step.why)}\\; {\\color{gray}\\scriptsize [${facts.join(' \\,\\textbullet\\, ')}]}`,
    });
  }
  return notes;
}

function missionChapter(mission: ManualMission): string {
  const notes = annotateMission(mission);
  const dir = `figures/missions/${mission.id}`;
  const lines: string[] = [];

  lines.push(`\\section{${tex(mission.title)}}`);
  lines.push(tex(mission.intro));
  lines.push('');
  lines.push('\\begin{center}');
  lines.push(
    `\\includegraphics[width=0.55\\textwidth]{${dir}/ply-000}\\\\`,
  );
  lines.push('{\\small\\textbf{Starting position.}}');
  lines.push('\\end{center}');
  lines.push('\\clearpage');

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const fig = `${dir}/ply-${pad(i + 1)}`;
    lines.push(`\\plyfig{${fig}}{${note.heading}}{${note.body}}%`);
    if (i % 2 === 0 && i + 1 < notes.length) {
      lines.push('\\hfill');
    } else {
      lines.push('');
      lines.push('\\vspace{0.9em}');
      lines.push('');
    }
    if ((i + 1) % 4 === 0) lines.push('\\clearpage');
  }
  lines.push('');
  lines.push('\\vspace{1em}');
  lines.push(`\\noindent\\textbf{Debrief.} ${tex(mission.outro)}`);
  lines.push('\\clearpage');
  return lines.join('\n');
}

const STRATEGY = String.raw`
\section{Fleet geometry: three sliding profiles}

Rated online play still opens with twin Beams (Standard Beams). Advanced lobby
modules can authorize \textbf{Refractor Wing} or \textbf{Fleet Draft} --- same
Sensor Net law, wider geometry. Learn all three heavy profiles as one system so
orthogonal blockades never feel like a complete shield.

\begin{description}
  \item[The Orthogonal Lane (Beams)] Rook-equivalent slides, restricted
        entirely to your active Sensor Net. The shipping default wing line.
  \item[The Diagonal Vector (Refractors)] Bishop-equivalent slides under the
        same net law. Refractors map across the corners of Chebyshev radiation
        boundaries and exploit blind spots left by pure orthogonal setups ---
        especially the diagonals that brush the Anomalous Core at $(5,5)$.
  \item[The Omni-Directional Anchor (Carriers)] Queen-equivalent slides while
        Hub-anchored (Chebyshev distance $\le$ Hub sensor radius, $3$ under
        fleet defaults). Drift outside that tether and the Carrier crawls one
        king-step (or one orthogonal step if Target Locked). Dual nature from
        the first page: fortress at home, rubber band if it overextends.
\end{description}

Target Lock still reduces Refractor and Carrier to a single orthogonal step.
No active net, no heavy slide --- for any of the three.

\section{How to read a position}

Every diagram in this manual shows four things at once. Learn to scan them in
this order:

\begin{enumerate}
  \item \textbf{Hub safety.} Where is each Command Hub, and can anything reach
        it \emph{next ply}? This question outranks every other. Most decided
        fleet games end by Surgical Strike, and most Surgical Strikes are
        walk-ins that the loser could have seen one move earlier. Check
        orthogonal \emph{and} diagonal approach lanes.
  \item \textbf{The nets.} Blue is White's Sensor Net, red is Black's, purple
        overlap is Contested Space (it counts for neither side's sector
        coverage). The net is not decoration: Beams, Refractors, and Carriers
        may only execute multi-square slides inside their own glow, and an
        enemy standing in your net is Target Locked.
  \item \textbf{Locked ships.} A Target Locked ship moves one orthogonal step,
        nothing else. A locked Beam or Refractor is a wall ornament; a locked
        Carrier cannot slide; a locked Infiltrator cannot warp. Count locked
        ships before you count material.
  \item \textbf{Link integrity.} Escorts only radiate while chained to the Hub
        (friendly ships no more than two squares apart). One careless step can
        silently unplug half your net.
\end{enumerate}

\section{What a move is worth}

Chess players value material; Go players value territory. Lattice asks you to
price three currencies at once:

\begin{description}
  \item[Material] Captures matter, but a dead Escort that was not radiating is
        worth less than one holding your net together. Heavy pieces sit higher
        on the ladder (below).
  \item[Coverage] Net cells are mobility for your heavy slides, Target Locks
        against the enemy, and --- after the sector clock arms --- a win
        condition. Diagonal coverage from a Refractor is real territory even
        when no orthogonal file is open.
  \item[Tempo] White moves first and holds the Initiative Relay Escort as
        compensation for having to commit first. Spending a ply on a move that
        neither threatens nor builds hands the initiative back. A Carrier that
        must crawl home after drifting has spent tempo twice.
\end{description}

\paragraph{Heavy-piece hierarchy (when the wing is in play).}
\begin{itemize}
  \item \textbf{Refractor --- high coverage, specialized material.} It commands
        massive diagonal reach across Chebyshev radiation squares but cannot
        hold a purely orthogonal line. Trading Beam for Refractor is usually
        lateral; trading an Escort for a Refractor is a massive tactical win.
  \item \textbf{Carrier --- maximum material, conditional tempo.} The ultimate
        defensive juggernaut while tethered: omni-directional slide dominates
        Material and Coverage, but pushing it up the board sacrifices Tempo
        when the Hub-anchor snaps. Prefer locking the home rank with the
        Carrier so Beams and Refractors can press; do not treat an untethered
        Carrier as a queen.
\end{itemize}

The recurring beginner error is over-valuing material: trading an active
linked Escort for a passive one is usually a loss even though the count says
even.

\section{Thinking ahead: the look-ahead scan}

Before every move, in order:

\begin{enumerate}
  \item \textbf{Can I take their Hub?} If yes, play it. The game ends. Scan
        Beam files \emph{and} Refractor diagonals (including slices past the
        Anomaly corners).
  \item \textbf{Can they take mine after my intended move?} Simulate your
        candidate, then check every enemy reply against your Hub square.
        If any reply lands there, your Hub is \emph{hanging} --- one ply from
        Surgical Strike. The rules still allow that move; the discipline is
        not to play it. Find another candidate. The academy drills this as
        \emph{refuse the hang}: never leave the flagship where they can
        capture it next. Orthogonal screens do not answer diagonal threats.
  \item \textbf{What does the move do for the nets?} Prefer moves that answer
        two ways at once: extend coverage \emph{and} threaten, retreat
        \emph{and} keep the chain linked.
  \item \textbf{Are my corners exposed to a Refractor slice?} The Anomalous
        Core at $(5,5)$ blocks orthogonal Beam paths through its row and
        column, so players feel safe behind that screen. Explicitly scan the
        diagonal vectors that brush the Anomaly's corners --- Refractors
        bypass orthogonal walls that look airtight.
  \item \textbf{Is the enemy Carrier tethered or drifting?} Instantly price
        Chebyshev distance from Carrier to its Command Hub. Within radius $3$
        (fleet defaults), treat it as an omni-directional lethal threat.
        Outside that radius, downgrade it to a single-step piece until it
        re-enters the Hub's radiation.
\end{enumerate}

Depth beyond one reply comes from asking question 2 recursively about forcing
lines only: captures, Hub threats, and moves that lock a key enemy ship.
Quiet positions do not need deep trees; sharp ones do.

\section{Openings: the first ten plies}

The mirrored fleet plus White's relay Escort makes openings about
\emph{structure}, not gambits:

\begin{itemize}
  \item Advance central Escorts first --- they carry the net forward and screen
        the Hub file.
  \item Keep every Escort within two squares of the chain. A linked fleet
        walks; an unlinked one crawls.
  \item Beams want \emph{prepared} files: slide them early inside your net to
        a lane that will point at the enemy Hub once coverage arrives.
  \item Under Refractor Wing or Fleet Draft, park heavies on files $3$ and $7$
        already inside the opening net. A Refractor contest of the center works
        differently than a Beam file claim --- diagonals matter from ply one.
  \item Under Fleet Draft, treat the Carrier as a home-rank fortress. Its
        Hub-anchor is a natural rubber band: early aggression that drifts it
        off the Hub trades capital mobility for a crawl.
  \item The Gravity Well at (5,5) splits the board. Decide early which side of
        it your pressure will live on --- and which diagonal seams you will
        contest around its corners.
\end{itemize}

\section{Midgame: pressure without overextension}

Mission 2 (Standard Beams) is the orthogonal model: net pressure, Target Lock
threats, and probing for a Hub mistake --- not racing to paint the map.
Overextended ships end up inside the enemy glow, locked, and become targets.
Watch for the moment an enemy Beam's lane \emph{or} Refractor diagonal and
your Hub share a clear path: that is when defensive plies stop being optional.
When a Carrier is on the board, re-check tether status every few plies --- the
same ship flips from fortress to foot soldier when it drifts.

\section{Pedagogical highlight: the Anomaly Slice}

Missions 1--3 below stay on Standard Beams so the rated opening stays
readable. This midgame sketch teaches the Refractor's job when Heavy wings
are authorized --- call it \emph{the 45-ply blind spot}.

\begin{description}
  \item[Setup] White has built a strong orthogonal blockade with Beams along
        a midboard rank, screening the Hub. Black's Escorts cannot find a
        clean breach on the files.
  \item[Execution] Black maneuvers a Refractor into active Sensor Net on a
        diagonal that brushes a corner of the $(5,5)$ Anomaly.
  \item[Lesson] White's orthogonal wall is blind to that vector. The diagonal
        slide past the Anomaly bypasses the Beams entirely and can force a
        Target Lock on White's Hub --- or open a Surgical Strike lane the
        Beam screen never saw. Orthogonal safety is incomplete safety.
\end{description}

\section{Endgame: strike, clock, or Lockout}

Three finishes exist. If a Hub hunt is winning, convert like Mission 1 and 2:
clear the lane (file or diagonal), keep your Hub from hanging, strike. If both
fleets dig
in, the sector clock (armed at ply 100 under fleet rules) turns coverage into
the win condition --- Mission 3. Late game, every net cell is a point on the
scoreboard, Contested Space is a weapon (project into their net to stall
their streak), and passive defense finally loses on the clock instead of
drawing forever.

The third finish is \textbf{Lockout}: leave the opponent with zero legal
replies. Bodies alone almost never force that against a live Command Hub --- a
cornered Hub can still capture its way out. Under \texttt{hybrid-fleet},
\textbf{Command Overload (EMP)} is the practical path:

\begin{itemize}[leftmargin=*]
  \item Charge only while your Hub stays put: each non-Hub ply of yours adds
        one to EMP charge; moving the Hub (or firing) resets it to zero.
  \item Default charge target is $15$ non-Hub plies; blast radius is Chebyshev
        $3$ from the Hub (lobby-tunable).
  \item Firing EMP \emph{is} your entire turn. Enemy ships inside the radius
        cannot move or capture for \texttt{empBlackoutPlies} of \emph{their}
        replies (default $1$). Your own fleet is never in the blast --- the
        cost is the spent turn, not friendly fire.
  \item If every remaining enemy ship is seized, \texttt{listLegalMoves} is
        empty and you win with \texttt{winnerReason=no-moves}.
\end{itemize}

Expanded branching from Refractors and Carriers does not change the win
conditions --- it changes which geometries feed them.
`;

function main() {
  const missions = buildManualMissions();
  const chapters = missions.map(missionChapter);

  const doc = String.raw`\documentclass[11pt,a4paper]{article}
%% GENERATED FILE — do not hand-edit.
%% Rebuild: yarn build:advanced-manual
%% (narration lives in packages/subspace-lattice-react/src/tutorial/)

\usepackage[margin=0.8in]{geometry}
\usepackage{graphicx}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{hyperref}

\graphicspath{{./}}

%% One annotated ply: diagram, move heading, coaching text.
\newcommand{\plyfig}[3]{%
  \begin{minipage}[t]{0.47\textwidth}
    \centering
    \includegraphics[width=0.94\linewidth]{#1}\\[0.3em]
    \begin{minipage}{0.96\linewidth}
      {\small\textbf{#2}}\\[0.15em]
      {\footnotesize #3}
    \end{minipage}
  \end{minipage}}

\hypersetup{colorlinks=true, linkcolor=black, urlcolor=blue!50!black}

\title{Subspace Lattice\\[0.4em]\large The Advanced Manual\\
\normalsize Three fully annotated games from the Fleet Academy}
\author{Interstellar Warp Gaming Federation \\ Digital Defiance}
\date{Rules version \texttt{hybrid-fleet} \\ Companion to the Official Rules (\texttt{rules.pdf})}

\begin{document}
\maketitle

\begin{abstract}
\noindent
This manual replays the guided Fleet Academy missions with every ply
diagrammed and explained: a short Surgical Strike highlight reel, a full
57-ply battle, a \texttt{hybrid-fleet} siege decided by the sector clock, and
Mission 4 --- Lockout via Command Overload (EMP). Part I teaches how to think
--- fleet geometry including optional Refractors and Carriers, reading
positions, valuing moves, and looking ahead. Later parts walk the games. Each
diagram shows the position \emph{after} the numbered ply; the moved ship's
squares glow.
\end{abstract}

\tableofcontents
\clearpage

\part{How to think in Subspace Lattice}
${STRATEGY}
\clearpage

\part{The annotated games}
${chapters.join('\n')}

\end{document}
`;

  const outPath = process.argv[2] ?? 'docs/advanced-manual.tex';
  writeFileSync(outPath, doc, 'utf8');

  // Report missing figures so the build script can decide to capture.
  let missing = 0;
  const figuresRoot = path.join(path.dirname(outPath), 'figures', 'missions');
  for (const mission of missions) {
    for (let ply = 0; ply <= mission.steps.length; ply++) {
      const svg = path.join(figuresRoot, mission.id, `ply-${pad(ply)}.svg`);
      if (!existsSync(svg)) missing++;
    }
  }
  const totalPlies = missions.reduce((sum, m) => sum + m.steps.length, 0);
  console.log(
    `advanced-manual — wrote ${outPath} (${missions.length} games, ${totalPlies} annotated plies, ${missing} figure SVGs missing)`,
  );
  if (missing > 0) process.exitCode = 2;
}

main();
