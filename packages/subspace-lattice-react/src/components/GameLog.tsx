import { useEffect, useMemo, useRef } from 'react';
import {
  formatLpgnGameLogLines,
  type MatchDebugMoveEntry,
} from '@subspace-lattice/core';
import { GameLogLine } from './GameLogLine';
import type { NameColorEntry } from '../lib/game-log-display';
import { useGameLogLpgn } from '../hooks/useGameLogLpgn';
import './GameLogLine.scss';

export interface GameLogProps {
  lines: readonly string[];
  /** Structured plies for LPGN display (Options → Game log → LPGN). */
  moveLog?: readonly MatchDebugMoveEntry[];
  nameColors?: readonly NameColorEntry[];
  title?: string;
}

export function GameLog({
  lines,
  moveLog,
  nameColors,
  title = 'Game log',
}: GameLogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [lpgn] = useGameLogLpgn();
  const displayLines = useMemo(() => {
    if (!lpgn) return lines;
    return formatLpgnGameLogLines(moveLog ?? []);
  }, [lpgn, lines, moveLog]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayLines.length, lpgn]);

  const heading = lpgn ? `${title} · LPGN` : title;

  return (
    <div
      className={`sll-game-log${lpgn ? ' sll-game-log--lpgn' : ''}`}
      data-testid="game-log"
      data-format={lpgn ? 'lpgn' : 'human'}
    >
      <p className="sll-game-log-header">{heading}</p>
      <div className="sll-log-body" ref={bodyRef}>
        {displayLines.length === 0 ? (
          <p className="sll-log-line">No moves yet.</p>
        ) : lpgn ? (
          displayLines.map((line, i) => (
            <p key={`${i}-${line}`} className="sll-log-line sll-log-line--lpgn">
              {line}
            </p>
          ))
        ) : (
          displayLines.map((line, i) => (
            <GameLogLine key={`${i}-${line}`} line={line} nameColors={nameColors} />
          ))
        )}
      </div>
    </div>
  );
}
