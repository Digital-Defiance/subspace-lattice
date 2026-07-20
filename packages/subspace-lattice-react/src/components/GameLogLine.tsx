import { getTeiGradeColor, type TeiGrade } from '@subspace-lattice/core';
import {
  splitBodyByNames,
  splitGameLogLine,
  type NameColorEntry,
} from '../lib/game-log-display';
import './GameLogLine.scss';

export interface GameLogLineProps {
  line: string;
  nameColors?: readonly NameColorEntry[];
  className?: string;
}

export function GameLogLine({
  line,
  nameColors = [],
  className,
}: GameLogLineProps) {
  const { timestamp, body } = splitGameLogLine(line);
  const segments = splitBodyByNames(body, nameColors);

  return (
    <p className={className ?? 'sll-log-line'}>
      {timestamp != null ? (
        <>
          <span className="sll-log-timestamp">{timestamp}</span>
          {' - '}
        </>
      ) : null}
      {segments.map((segment, index) => {
        if (segment.tei) {
          const colorClass = getTeiGradeColor(segment.tei.grade as TeiGrade);
          const label = segment.tei.reference
            ? `reference ${segment.tei.grade}${segment.tei.score}`
            : `${segment.tei.grade}${segment.tei.score}`;
          return (
            <span
              key={`${index}-${segment.text}`}
              className="sll-tei-cell"
              aria-label={label}
            >
              {segment.tei.reference ? (
                <span className="sll-tei-ref">ref </span>
              ) : null}
              <span
                className={`sll-tei-grade sll-tei-grade--${colorClass}`}
              >
                {segment.tei.grade}
              </span>
              <span className="sll-tei-score">{segment.tei.score}</span>
            </span>
          );
        }
        if (segment.coordinate) {
          const { left, right, separator } = segment.coordinate;
          const spoken = `${left} comma ${right}`;
          return (
            <span
              key={`${index}-${segment.text}`}
              className="sll-coord-cell"
              aria-label={spoken}
            >
              <span className="sll-coord-pip">({left}</span>
              <span className="sll-coord-sep" aria-hidden>
                {separator}
              </span>
              <span className="sll-coord-pip">{right})</span>
            </span>
          );
        }
        if (segment.color) {
          return (
            <span
              key={`${index}-${segment.text}`}
              className="sll-captain-name"
              style={{ color: segment.color }}
            >
              {segment.text}
            </span>
          );
        }
        return <span key={`${index}-${segment.text}`}>{segment.text}</span>;
      })}
    </p>
  );
}
