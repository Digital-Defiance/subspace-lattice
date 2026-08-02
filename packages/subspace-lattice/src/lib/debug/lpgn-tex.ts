/**
 * Emit LaTeX for an annotated LPGN game (print diagrams + coaching text).
 */
import type {
  LpgnAnnotationReport,
  LpgnPlyAnnotation,
} from './lpgn-annotate';
import { gameStateToBoardSvg } from './board-svg';
import type { LpgnReplayPly } from './lpgn-replay';
import type { PlayedMoveGrade } from '../ai/advisor';

function tex(input: string): string {
  return input
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\*\*/g, '');
}

/**
 * Escape coach copy for TeX. Full-width ply blocks do not need soft
 * hyphenation hints (those caused `opening-/screen` and `fringe /`
 * mid-token breaks when columns were narrow).
 */
function coachTex(input: string): string {
  return tex(input).replace(/->/g, '$\\rightarrow$');
}

/** Nested itemize for summary lines that use a leading `  · ` child marker. */
export function formatSummaryItems(summary: string[]): string {
  const lines: string[] = [];
  let i = 0;
  while (i < summary.length) {
    const line = summary[i] ?? '';
    if (/^\s+·\s/.test(line)) {
      lines.push(`  \\item ${coachTex(line.replace(/^\s+·\s+/, ''))}`);
      i += 1;
      continue;
    }
    const children: string[] = [];
    let j = i + 1;
    while (j < summary.length && /^\s+·\s/.test(summary[j] ?? '')) {
      children.push((summary[j] ?? '').replace(/^\s+·\s+/, ''));
      j += 1;
    }
    lines.push(`  \\item ${coachTex(line)}`);
    if (children.length > 0) {
      lines.push(
        '  \\begin{itemize}[leftmargin=1.25em,itemsep=0.05em,topsep=0.15em,parsep=0pt]',
      );
      for (const child of children) {
        lines.push(`    \\item ${coachTex(child)}`);
      }
      lines.push('  \\end{itemize}');
    }
    i = j;
  }
  return lines.join('\n');
}

const pad = (n: number) => String(n).padStart(3, '0');

function uniqueTipReasons(
  grade: PlayedMoveGrade,
  playedWhy: string[],
): string[] {
  const played = new Set(playedWhy.map((w) => w.trim()));
  const out: string[] = [];
  for (const line of grade.alternative?.reasons ?? []) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('Move ') || t.startsWith('Selected by the tactical')) continue;
    if (played.has(t)) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= 2) break;
  }
  return out;
}

function formatGradeLines(grade: PlayedMoveGrade, playedWhy: string[]): string[] {
  const shortlist = `1-ply shortlist \\#${grade.rank}/${grade.candidateCount} (${grade.optimalityPct}\\%)`;
  const lines: string[] = [];

  if (grade.agreesWithTop) {
    lines.push(
      `\\textbf{Grade:} Matched advisor tip · ${shortlist}.`,
    );
    return lines;
  }

  // Tip and shortlist are different signals — never claim "disagreed" when
  // shortlist ranked the play #1; say the deeper tip preferred another plan.
  if (grade.rank === 1) {
    lines.push(
      `\\textbf{Grade:} ${shortlist} (top of shortlist). Deeper search still preferred another plan.`,
    );
  } else {
    lines.push(
      `\\textbf{Grade:} ${shortlist}. Deeper search preferred another plan.`,
    );
  }

  if (grade.alternative) {
    const tipExtra = uniqueTipReasons(grade, playedWhy);
    const tipTail =
      tipExtra.length > 0
        ? ` --- ${coachTex(tipExtra.join(' '))}`
        : '';
    lines.push(
      `\\textbf{Try instead:} ${coachTex(grade.alternative.summary)}${tipTail}`,
    );
  }
  return lines;
}

function formatPlyBody(
  ann: LpgnAnnotationReport['annotations'][number],
): string {
  const lines: string[] = [];
  if (ann.facts.length) {
    lines.push(coachTex(ann.facts.join(' · ')));
  }
  if (ann.shortcut) {
    lines.push(`\\textbf{Shortcut:} ${coachTex(ann.shortcut.note)}`);
  }
  if (ann.branch) {
    const idea = ann.branch.betterIdea
      ? ` \\emph{Better idea:} ${coachTex(ann.branch.betterIdea)}`
      : '';
    lines.push(
      `\\textbf{Branch:} ${coachTex(ann.branch.title)}. ${coachTex(ann.branch.note)}${idea}`,
    );
  }
  if (ann.why.length) {
    const phaseBit = ann.phase
      ? `\\textit{${coachTex(ann.phase)}} --- `
      : '';
    lines.push(
      `\\textbf{Why:} ${phaseBit}${coachTex(ann.why.join(' '))}`,
    );
  }
  if (ann.grade) {
    lines.push(...formatGradeLines(ann.grade, ann.why));
  }
  return lines.join('\\\\[0.25em]\n');
}

/** Collapse repeated tip disagreements into front-matter themes. */
function buildTeachingThemes(annotations: LpgnPlyAnnotation[]): string {
  const tipCounts = new Map<string, { count: number; plies: number[] }>();
  let shortlistTopButTipDiffers = 0;
  let lowShortlist = 0;

  for (const ann of annotations) {
    const g = ann.grade;
    if (!g || g.agreesWithTop) continue;
    if (g.rank === 1) shortlistTopButTipDiffers += 1;
    if (g.optimalityPct < 40) lowShortlist += 1;
    const tip = g.alternative?.summary ?? 'other plan';
    const key = tip.replace(/\s*\(.*$/, '').trim() || tip;
    const row = tipCounts.get(key) ?? { count: 0, plies: [] };
    row.count += 1;
    if (row.plies.length < 6) row.plies.push(ann.ply);
    tipCounts.set(key, row);
  }

  const ranked = [...tipCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  if (ranked.length === 0) {
    return [
      '\\noindent No repeated tip disagreements to theme --- either the seat',
      ' matched search often, or grades were not run.',
    ].join('');
  }

  const bullets = ranked.map(([tip, row]) => {
    const plyList = row.plies.map((p) => String(p)).join(', ');
    const more = row.count > row.plies.length ? ', \\ldots' : '';
    return (
      '  \\item \\textbf{' +
      coachTex(tip) +
      '} --- preferred on ' +
      row.count +
      ' graded ply(ies) (e.g.\\ ' +
      plyList +
      more +
      ').'
    );
  });

  const meta: string[] = [];
  if (shortlistTopButTipDiffers > 0) {
    meta.push(
      'On ' +
        shortlistTopButTipDiffers +
        " ply(ies) the 1-ply shortlist liked your move, but deeper search still wanted a different plan --- treat those as plan disagreements, not blunders.",
    );
  }
  if (lowShortlist > 0) {
    meta.push(
      lowShortlist +
        ' ply(ies) scored under 40\\% on the 1-ply shortlist --- those are the clearer tactical misses.',
    );
  }

  return [
    '\\noindent Recurring deeper-search preferences (what to practice):',
    '\\begin{enumerate}[leftmargin=*]',
    ...bullets,
    '\\end{enumerate}',
    meta.length ? '\\noindent ' + meta.join(' ') : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface LpgnTexBundle {
  tex: string;
  /**
   * Relative path (from .tex) → SVG contents.
   * Empty when using Board capture (Playwright); letter fallbacks when
   * `letterSvg: true`.
   */
  figures: Map<string, string>;
  /** Half-move indices to capture (after that ply; matches ply-NNN.svg). */
  diagramPlies: number[];
  id: string;
}

export function buildLpgnAnnotatedTex(
  report: LpgnAnnotationReport,
  options: {
    id?: string;
    /** Diagram every ply (heavy) vs key moments only. */
    everyPly?: boolean;
    /**
     * Emit letter-glyph SVG fallbacks. Prefer Board captures
     * (`yarn capture:lpgn-figures`) for Sensor Net / EMP / piece art.
     */
    letterSvg?: boolean;
  } = {},
): LpgnTexBundle {
  const h = report.replay.parsed.headers;
  const id =
    options.id ??
    (h.Sector ?? 'lpgn-game').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
  const everyPly = options.everyPly ?? false;
  const letterSvg = options.letterSvg ?? false;
  const figures = new Map<string, string>();
  const diagramPlies: number[] = [];

  const shortcutSection = [
    report.shortcuts.length === 0
      ? String.raw`\noindent No missed mate-in-1 or mate-in-2 for the annotated seat under the tactical scan.`
      : [
          String.raw`\noindent Faster forced wins the scan found (play these instead of the recorded ply):`,
          String.raw`\begin{enumerate}[leftmargin=*]`,
          ...report.shortcuts.map(
            (s) =>
              String.raw`  \item Ply ${s.atPly + 1}: \texttt{${tex(s.moveLabel)}} (mate-in-${s.depth}) instead of \texttt{${tex(s.playedToken)}} --- ${coachTex(s.note)}`,
          ),
          String.raw`\end{enumerate}`,
        ].join('\n'),
    '',
    String.raw`\subsection*{Coaching branch points}`,
    report.branches.length === 0
      ? String.raw`\noindent No soft branch markers.`
      : [
          String.raw`\begin{enumerate}[leftmargin=*]`,
          ...report.branches.map((b) => {
            const idea = b.betterIdea
              ? String.raw` \emph{Better idea:} ${coachTex(b.betterIdea)}`
              : '';
            return String.raw`  \item Ply ${b.atPly + 1} --- \textbf{${coachTex(b.title)}}. ${coachTex(b.note)}${idea}`;
          }),
          String.raw`\end{enumerate}`,
        ].join('\n'),
  ].join('\n');

  const plyBlocks: string[] = [];

  for (let i = 0; i < report.annotations.length; i++) {
    const ann = report.annotations[i]!;
    const plyRec: LpgnReplayPly = report.replay.plies[i]!;
    const showFig = everyPly || ann.isKeyDiagram;
    const body = formatPlyBody(ann);

    if (!showFig) {
      // Text-only plies: keep heading+body together without a full-page minipage
      // (oversized minipages were a source of blank-looking overflow pages).
      plyBlocks.push(
        String.raw`\begin{plyblock}`,
        String.raw`\noindent{\small\textbf{${coachTex(ann.heading)}}}\\[0.2em]`,
        String.raw`{\footnotesize ${body}\par}`,
        String.raw`\end{plyblock}`,
      );
      continue;
    }

    diagramPlies.push(ann.ply);
    const rel = `figures/lpgn/${id}/ply-${pad(ann.ply)}.pdf`;
    const svgRel = `figures/lpgn/${id}/ply-${pad(ann.ply)}.svg`;
    if (letterSvg) {
      figures.set(
        svgRel,
        gameStateToBoardSvg(plyRec.after, {
          focusCells: ann.focus,
          title: `After ply ${ann.ply}: ${ann.token}`,
        }),
      );
    }

    plyBlocks.push(
      String.raw`\begin{plyblock}`,
      String.raw`\centering\includegraphics[width=0.58\textwidth]{${rel}}\\[0.35em]`,
      String.raw`\noindent{\small\textbf{${coachTex(ann.heading)}}}\\[0.2em]`,
      String.raw`{\footnotesize ${body}\par}`,
      String.raw`\end{plyblock}`,
    );
  }

  const summaryItems = formatSummaryItems(report.summary);

  const title = `${h.White ?? 'White'} vs ${h.Black ?? 'Black'}`;
  const doc = String.raw`\documentclass[11pt,a4paper]{article}
%% GENERATED — LPGN annotated report. Rebuild via yarn annotate:lpgn
%% Boards: Board harness capture (Sensor Net + EMP/TO + piece art)
\usepackage[margin=0.75in]{geometry}
\usepackage{graphicx}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{needspace}
\graphicspath{{./}}
%% One ply per block (full width). Prefer page breaks *between* plies.
\newenvironment{plyblock}{%
  \par\addvspace{0.65em}%
  \Needspace{6\baselineskip}%
  \noindent\begin{minipage}{\textwidth}%
}{%
  \end{minipage}\par\addvspace{0.35em}%
}
\hypersetup{colorlinks=true, linkcolor=black, urlcolor=blue!50!black}
\title{Subspace Lattice\\[0.35em]\large Annotated LPGN\\[0.2em]\normalsize ${tex(title)}}
\author{${tex(h.Event ?? 'Match')} \\ ${tex(h.Site ?? '')}}
\date{${tex(h.Date ?? '')} \\ Rules \texttt{${tex(h.Rules ?? '')}} · ${tex(h.HeavyWing ?? '')}}
\begin{document}
\maketitle
\begin{abstract}
\begin{itemize}[leftmargin=*,itemsep=0.15em]
${summaryItems}
\end{itemize}
\end{abstract}
\tableofcontents
\clearpage
\section{Shortcuts to victory}
${shortcutSection}
\clearpage
\section{What to practice}
${buildTeachingThemes(report.annotations)}
\clearpage
\section{Advisor grades}
\noindent Both seats get a \textbf{Why} (strategic plan + tactical notes).
Only the annotated seat gets grades.
\begin{itemize}[leftmargin=*]
  \item \textbf{Why} names the longer goal (build screen, liquidate, sector race, Hub hunt, EMP, Terminal).
  \item \textbf{1-ply shortlist} ranks your move among heuristic candidates this turn --- good for tactics.
  \item \textbf{Advisor tip} is deeper search (MCTS at the chosen strength). It can differ from the shortlist even when your move was shortlist \#1; that is a plan disagreement, not a blunder label.
  \item Opponent plies explain intent without ranking.
\end{itemize}

\section{Annotated plies}
${plyBlocks.join('\n')}
\end{document}
`;

  return { tex: doc, figures, diagramPlies, id };
}
