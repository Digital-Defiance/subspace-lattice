import { useEffect, useRef } from 'react';
import { GameLogLine } from './GameLogLine';
import type { NameColorEntry } from '../lib/game-log-display';
import './GameLogLine.scss';

export interface GameLogProps {
  lines: readonly string[];
  nameColors?: readonly NameColorEntry[];
  title?: string;
}

export function GameLog({
  lines,
  nameColors,
  title = 'Game log',
}: GameLogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="sll-game-log" data-testid="game-log">
      <p className="sll-game-log-header">{title}</p>
      <div className="sll-log-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <p className="sll-log-line">No moves yet.</p>
        ) : (
          lines.map((line, i) => (
            <GameLogLine key={`${i}-${line}`} line={line} nameColors={nameColors} />
          ))
        )}
      </div>
    </div>
  );
}
