import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GameState,
  PieceType,
  PlayerColor,
  Coordinate,
  CellType,
  Cell,
  Piece as BoardPiece,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import { Piece as PieceArt } from './Piece';
import { getStyleRimFlags } from './PieceStyles';
import {
  useBoardContrastOutline,
} from '../hooks/useBoardContrastOutline';
import {
  usePieceStyle,
} from '../hooks/usePieceStyle';
import { useShowPowerRelay } from '../hooks/useShowPowerRelay';
import './Board.scss';

interface BoardProps {
  gameState: GameState;
  /**
   * Live match engine. When provided, legal-move hints use this instance so
   * they cannot drift from submitMove / movePiece. Falls back to a fromState
   * clone when omitted (figures harness, static previews).
   */
  engine?: SubspaceLatticeEngine;
  /** Return false to keep the current selection (illegal / rejected move). */
  onMovePiece: (
    pieceId: string,
    to: Coordinate,
  ) => boolean | void | Promise<boolean>;
  onPlacePiece: (type: PieceType, to: Coordinate) => void;
  localPlayer: PlayerColor | 'OBSERVER';
  guidance?: BoardGuidance;
  onInvalidAction?: (message: string) => void;
  /** Force a piece art style index (skips persisted preference). */
  pieceStyle?: number;
  /** Force Outline on/off (skips persisted preference). */
  contrastOutline?: boolean;
  /** Force selection-scoped Hub relay path on/off (skips persisted preference). */
  showPowerRelay?: boolean;
  /**
   * When false (e.g. online waiting room), suppress selection and legal-move
   * highlights even if a seat color is set. Off-turn and game-over also
   * disable play.
   */
  interactive?: boolean;
}

export interface BoardGuidance {
  /** If set, only these pieces may be selected during this teaching step. */
  selectablePieceIds?: readonly string[];
  /** If set, only these destinations may be submitted. */
  allowedDestinations?: readonly Coordinate[];
  /** Additional cells the coach wants to call attention to. */
  focusCells?: readonly Coordinate[];
  /** Advisor from→to highlights (amber, Warp-style). */
  advisorFrom?: Coordinate;
  advisorTo?: Coordinate;
}

export const Board: React.FC<BoardProps> = ({
  gameState,
  engine: engineProp,
  onMovePiece,
  localPlayer,
  guidance,
  onInvalidAction,
  pieceStyle: forcedPieceStyle,
  contrastOutline: forcedOutline,
  showPowerRelay: forcedPowerRelay,
  interactive = true,
}) => {
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [styleIndex] = usePieceStyle(forcedPieceStyle);
  const [pieceOutline] = useBoardContrastOutline(forcedOutline);
  const [powerRelayOn] = useShowPowerRelay(forcedPowerRelay);
  const rimFlags = getStyleRimFlags(styleIndex);
  // Outline always adds a *white* visibility trace — never a dark one.
  // Skip sides that already ship a light rim (avoids double-white).
  const outlineBlack = pieceOutline && !rimFlags.lightRimOnBlack;
  const outlineWhite = pieceOutline && !rimFlags.lightRimOnWhite;
  const initialFocus =
    Object.values(gameState.pieces).find(
      (piece) => piece.owner === localPlayer,
    )?.position ?? { x: 0, y: 0 };
  const [focusedCell, setFocusedCell] = useState<Coordinate>(initialFocus);
  const boardRef = useRef<HTMLDivElement>(null);

  const derivedEngine = useMemo(
    () => SubspaceLatticeEngine.fromState(gameState),
    [gameState],
  );
  const engine = engineProp ?? derivedEngine;

  const playable =
    interactive &&
    localPlayer !== 'OBSERVER' &&
    !gameState.winner &&
    gameState.currentPlayer === localPlayer;

  const turnKey = `${gameState.currentPlayer}:${gameState.plyCount ?? 0}`;

  useEffect(() => {
    setSelectedPieceId(null);
  }, [turnKey]);

  useEffect(() => {
    if (!playable) setSelectedPieceId(null);
  }, [playable]);

  const showNet = engine.isHybrid();
  const whiteNet = useMemo(
    () => (showNet ? engine.getSensorNetSet(PlayerColor.White) : null),
    [engine, showNet],
  );
  const blackNet = useMemo(
    () => (showNet ? engine.getSensorNetSet(PlayerColor.Black) : null),
    [engine, showNet],
  );
  const powerRelayLinks = useMemo(() => {
    if (!showNet || !powerRelayOn || !selectedPieceId) return [];
    return engine.getSensorNetRelayPath(selectedPieceId);
  }, [engine, showNet, powerRelayOn, selectedPieceId]);
  const terminalBlastBySide = useMemo(() => {
    const white = new Set<string>();
    const black = new Set<string>();
    const n = gameState.boardSize;
    const paint = (color: PlayerColor, into: Set<string>) => {
      if (!engine.isTerminalOverclock(color)) return;
      const hub = Object.values(gameState.pieces).find(
        (piece) =>
          piece.owner === color && piece.type === PieceType.CommandHub,
      );
      if (!hub) return;
      const radius = engine.getEmpRadius(color);
      for (
        let x = Math.max(0, hub.position.x - radius);
        x <= Math.min(n - 1, hub.position.x + radius);
        x++
      ) {
        for (
          let y = Math.max(0, hub.position.y - radius);
          y <= Math.min(n - 1, hub.position.y + radius);
          y++
        ) {
          into.add(`${x},${y}`);
        }
      }
    };
    paint(PlayerColor.White, white);
    paint(PlayerColor.Black, black);
    return { white, black };
  }, [engine, gameState.boardSize, gameState.pieces]);
  const spoolTargets = useMemo(
    () =>
      new Set(
        Object.values(gameState.pieces)
          .filter((piece) => piece.spoolTarget)
          .map(
            (piece) =>
              `${piece.spoolTarget!.x},${piece.spoolTarget!.y}`,
          ),
      ),
    [gameState.pieces],
  );

  const handleCellClick = (x: number, y: number) => {
    if (!playable) return;

    const cell = gameState.cells.find(
      (c: Cell) => c.coordinate.x === x && c.coordinate.y === y,
    );
    const to = { x, y };

    // Prefer executing a legal move to this square over re-selecting.
    if (selectedPieceId) {
      const selected = engine.getPiece(selectedPieceId);
      const legalHere =
        !!selected &&
        engine.canMovePiece(selected, to) &&
        (!guidance?.allowedDestinations ||
          guidance.allowedDestinations.some(
            (coord) => coord.x === x && coord.y === y,
          ));
      if (legalHere) {
        const accepted = onMovePiece(selectedPieceId, to);
        // Promises are treated as accepted for UI (online optimistic apply);
        // only an immediate `false` keeps the selection.
        if (accepted === false) {
          onInvalidAction?.(
            'That move is not legal right now. Pick another highlighted square.',
          );
        } else {
          setSelectedPieceId(null);
        }
        return;
      }
      if (
        guidance?.allowedDestinations &&
        selected &&
        engine.canMovePiece(selected, to)
      ) {
        onInvalidAction?.(
          'That destination will not complete this objective. Choose a highlighted square.',
        );
        return;
      }
    }

    if (cell?.pieceId) {
      const piece = gameState.pieces[cell.pieceId];
      if (piece?.owner === localPlayer) {
        if (
          guidance?.selectablePieceIds &&
          !guidance.selectablePieceIds.includes(piece.id)
        ) {
          onInvalidAction?.(
            'That ship is not part of this step. Follow the highlighted objective.',
          );
          return;
        }
        setSelectedPieceId(piece.id);
        return;
      }
    }

    if (selectedPieceId) {
      onInvalidAction?.(
        'That square is not a legal destination for the selected ship.',
      );
      return;
    }

    onInvalidAction?.(
      'Select one of your ships first, then choose where it should move.',
    );
  };

  const terminalBlastClass = (x: number, y: number): string => {
    const key = `${x},${y}`;
    const w = terminalBlastBySide.white.has(key);
    const b = terminalBlastBySide.black.has(key);
    if (w && b) return 'terminal-blast-contested';
    if (w) return 'terminal-blast-white';
    if (b) return 'terminal-blast-black';
    return '';
  };

  const netClass = (x: number, y: number): string => {
    if (!showNet || !whiteNet || !blackNet) return '';
    // Terminal EMP disks own the cell tint — don't muddy with Sensor Net mixes.
    if (terminalBlastClass(x, y)) return '';
    const key = `${x},${y}`;
    const w = whiteNet.has(key);
    const b = blackNet.has(key);
    if (w && b) return 'sovereign-contested';
    if (w) return 'sovereign-white';
    if (b) return 'sovereign-black';
    return '';
  };

  const isTerminalBlast = (x: number, y: number): boolean =>
    Boolean(terminalBlastClass(x, y));

  const cellCenter = (coord: Coordinate): { cx: number; cy: number } => ({
    cx: coord.x + 0.5,
    // Display sorts high y to the top row — flip for SVG overlay.
    cy: gameState.boardSize - 1 - coord.y + 0.5,
  });

  const selectedPiece = selectedPieceId
    ? engine.getPiece(selectedPieceId)
    : undefined;
  const isGuidedDestination = (coord: Coordinate): boolean =>
    Boolean(
      guidance?.allowedDestinations?.some(
        (candidate) =>
          candidate.x === coord.x && candidate.y === coord.y,
      ),
    );
  const isFocusCell = (coord: Coordinate): boolean =>
    Boolean(
      guidance?.focusCells?.some(
        (candidate) =>
          candidate.x === coord.x && candidate.y === coord.y,
      ),
    );
  const isAdvisorFrom = (coord: Coordinate): boolean =>
    Boolean(
      guidance?.advisorFrom &&
        guidance.advisorFrom.x === coord.x &&
        guidance.advisorFrom.y === coord.y,
    );
  const isAdvisorTo = (coord: Coordinate): boolean =>
    Boolean(
      guidance?.advisorTo &&
        guidance.advisorTo.x === coord.x &&
        guidance.advisorTo.y === coord.y,
    );
  const isLegalDestination = (coord: Coordinate): boolean =>
    Boolean(
      playable &&
        selectedPiece &&
        engine.canMovePiece(selectedPiece, coord) &&
        (!guidance?.allowedDestinations || isGuidedDestination(coord)),
    );
  const displayCells = useMemo(
    () =>
      [...gameState.cells].sort(
        (left, right) =>
          right.coordinate.y - left.coordinate.y ||
          left.coordinate.x - right.coordinate.x,
      ),
    [gameState.cells],
  );

  const focusCell = (coord: Coordinate) => {
    const bounded = {
      x: Math.min(Math.max(coord.x, 0), gameState.boardSize - 1),
      y: Math.min(Math.max(coord.y, 0), gameState.boardSize - 1),
    };
    setFocusedCell(bounded);
    boardRef.current
      ?.querySelector<HTMLElement>(
        `[data-cell-x="${bounded.x}"][data-cell-y="${bounded.y}"]`,
      )
      ?.focus();
  };

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    coord: Coordinate,
  ) => {
    const next = { ...coord };
    if (event.key === 'ArrowRight') next.x += 1;
    else if (event.key === 'ArrowLeft') next.x -= 1;
    else if (event.key === 'ArrowUp') next.y += 1;
    else if (event.key === 'ArrowDown') next.y -= 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCellClick(coord.x, coord.y);
      return;
    } else if (event.key === 'Escape') {
      setSelectedPieceId(null);
      return;
    } else {
      return;
    }
    event.preventDefault();
    focusCell(next);
  };

  const cellLabel = (
    cell: Cell,
    piece: BoardPiece | null,
    detected: boolean,
    terminalBlast: boolean,
  ): string => {
    const coordinate = `column ${cell.coordinate.x}, row ${cell.coordinate.y}`;
    if (cell.type === CellType.GravityWell) {
      return `${coordinate}, Gravity Well, blocked`;
    }
    const blastNote = terminalBlast ? ', Terminal EMP blast radius' : '';
    if (!piece) return `${coordinate}, empty${blastNote}`;
    const pieceName = {
      [PieceType.CommandHub]: 'Command Hub',
      [PieceType.Escort]: 'Escort',
      [PieceType.Infiltrator]: 'Infiltrator',
      [PieceType.Beam]: 'Beam',
      [PieceType.Refractor]: 'Refractor',
      [PieceType.Carrier]: 'Carrier',
    }[piece.type];
    return `${coordinate}, ${piece.owner} ${pieceName}${detected ? ', Target Locked' : ''}${blastNote}`;
  };

  return (
    <div
      ref={boardRef}
      className={`subspace-board${
        outlineBlack ? ' subspace-board--outline-black' : ''
      }${outlineWhite ? ' subspace-board--outline-white' : ''}`}
      style={
        {
          '--board-n': gameState.boardSize,
        } as React.CSSProperties
      }
      role="grid"
      aria-label="Game board. Use arrow keys to move between squares, Enter or Space to select and move, and Escape to cancel selection."
      aria-rowcount={gameState.boardSize}
      aria-colcount={gameState.boardSize}
      data-piece-outline={
        outlineBlack || outlineWhite ? 'true' : undefined
      }
      data-playable={playable ? 'true' : 'false'}
      data-power-relay={powerRelayOn && showNet ? 'true' : undefined}
    >
      {powerRelayLinks.length > 0 && (
        <svg
          className="power-relay-overlay"
          viewBox={`0 0 ${gameState.boardSize} ${gameState.boardSize}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {powerRelayLinks.map((link) => {
            const a = cellCenter(link.from);
            const b = cellCenter(link.to);
            return (
              <line
                key={`${link.fromId}-${link.toId}`}
                className="power-relay-link"
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
              />
            );
          })}
        </svg>
      )}
      {displayCells.map((cell: Cell) => {
        const piece = cell.pieceId ? gameState.pieces[cell.pieceId] : null;
        const isSelected = playable && piece?.id === selectedPieceId;
        const isGravityWell = cell.type === CellType.GravityWell;
        const isSpoolTarget = spoolTargets.has(
          `${cell.coordinate.x},${cell.coordinate.y}`,
        );
        const detected =
          showNet && piece ? engine.isPieceDetected(piece) : false;
        const terminalBlast = isTerminalBlast(
          cell.coordinate.x,
          cell.coordinate.y,
        );
        const blastClass = terminalBlastClass(
          cell.coordinate.x,
          cell.coordinate.y,
        );
        const isSelectable =
          playable &&
          piece?.owner === localPlayer &&
          (!guidance?.selectablePieceIds ||
            guidance.selectablePieceIds.includes(piece.id));
        const isDestination = isLegalDestination(cell.coordinate);
        const isFocused = isFocusCell(cell.coordinate);

        return (
          <div
            key={`${cell.coordinate.x}-${cell.coordinate.y}`}
            className={`subspace-cell ${isGravityWell ? 'gravity-well' : ''} ${isSelected ? 'selected' : ''} ${isSpoolTarget ? 'spool-target' : ''} ${isSelectable && guidance ? 'tutorial-selectable' : ''} ${isDestination ? 'legal-destination' : ''} ${playable && isGuidedDestination(cell.coordinate) ? 'tutorial-destination' : ''} ${isFocused ? 'tutorial-focus' : ''} ${isAdvisorFrom(cell.coordinate) ? 'advisor-from' : ''} ${isAdvisorTo(cell.coordinate) ? 'advisor-to' : ''} ${netClass(cell.coordinate.x, cell.coordinate.y)} ${blastClass}`}
            data-testid={`cell-${cell.coordinate.x}-${cell.coordinate.y}`}
            data-cell-x={cell.coordinate.x}
            data-cell-y={cell.coordinate.y}
            role="gridcell"
            aria-rowindex={gameState.boardSize - cell.coordinate.y}
            aria-colindex={cell.coordinate.x + 1}
            aria-label={cellLabel(cell, piece, detected, terminalBlast)}
            aria-selected={isSelected}
            aria-disabled={!playable || undefined}
            tabIndex={
              focusedCell.x === cell.coordinate.x &&
              focusedCell.y === cell.coordinate.y
                ? 0
                : -1
            }
            title={
              isSpoolTarget
                ? 'Navigational Target Lock'
                : detected
                  ? 'Target Locked — special movement suppressed'
                  : blastClass === 'terminal-blast-white'
                    ? 'White Terminal EMP blast radius'
                    : blastClass === 'terminal-blast-black'
                      ? 'Black Terminal EMP blast radius'
                      : blastClass === 'terminal-blast-contested'
                        ? 'Overlapping Terminal EMP blast radii'
                        : undefined
            }
            onClick={() =>
              handleCellClick(cell.coordinate.x, cell.coordinate.y)
            }
            onFocus={() => setFocusedCell(cell.coordinate)}
            onKeyDown={(event) =>
              handleCellKeyDown(event, cell.coordinate)
            }
          >
            {piece && (
              <span
                className={`piece piece-svg ${piece.owner.toLowerCase()} ${detected ? 'detected' : ''}`}
                aria-hidden="true"
              >
                <PieceArt
                  color={
                    piece.owner === PlayerColor.White ? 'white' : 'black'
                  }
                  styleIndex={styleIndex}
                  pieceType={piece.type}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
