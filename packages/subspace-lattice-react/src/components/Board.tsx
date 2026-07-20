import React, { useMemo, useRef, useState } from 'react';
import {
  GameState,
  PieceType,
  PlayerColor,
  Coordinate,
  CellType,
  Cell,
  Piece,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import './Board.scss';

interface BoardProps {
  gameState: GameState;
  onMovePiece: (pieceId: string, to: Coordinate) => void;
  onPlacePiece: (type: PieceType, to: Coordinate) => void;
  localPlayer: PlayerColor | 'OBSERVER';
  guidance?: BoardGuidance;
  onInvalidAction?: (message: string) => void;
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
  onMovePiece,
  localPlayer,
  guidance,
  onInvalidAction,
}) => {
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const initialFocus =
    Object.values(gameState.pieces).find(
      (piece) => piece.owner === localPlayer,
    )?.position ?? { x: 0, y: 0 };
  const [focusedCell, setFocusedCell] = useState<Coordinate>(initialFocus);
  const boardRef = useRef<HTMLDivElement>(null);

  const engine = useMemo(
    () => SubspaceLatticeEngine.fromState(gameState),
    [gameState],
  );

  const showNet = engine.isHybrid();
  const whiteNet = useMemo(
    () => (showNet ? engine.getSensorNetSet(PlayerColor.White) : null),
    [engine, showNet],
  );
  const blackNet = useMemo(
    () => (showNet ? engine.getSensorNetSet(PlayerColor.Black) : null),
    [engine, showNet],
  );
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
    if (localPlayer === 'OBSERVER') return;

    const cell = gameState.cells.find(
      (c: Cell) => c.coordinate.x === x && c.coordinate.y === y,
    );

    if (cell?.pieceId) {
      const piece = gameState.pieces[cell.pieceId];
      if (piece?.owner === localPlayer) {
        if (
          guidance?.selectablePieceIds &&
          !guidance.selectablePieceIds.includes(piece.id)
        ) {
          onInvalidAction?.('That ship is not part of this step. Follow the highlighted objective.');
          return;
        }
        setSelectedPieceId(piece.id);
        return;
      }
    }

    if (selectedPieceId && cell) {
      if (
        guidance?.allowedDestinations &&
        !guidance.allowedDestinations.some(
          (coord) => coord.x === x && coord.y === y,
        )
      ) {
        onInvalidAction?.('That destination will not complete this objective. Choose a highlighted square.');
        return;
      }
      onMovePiece(selectedPieceId, { x, y });
      setSelectedPieceId(null);
      return;
    }

    onInvalidAction?.('Select one of your ships first, then choose where it should move.');
  };

  const getPieceSymbol = (type: PieceType, color: PlayerColor) => {
    const isWhite = color === PlayerColor.White;
    switch (type) {
      case PieceType.CommandHub:
        return isWhite ? '♔' : '♚';
      case PieceType.Escort:
        return isWhite ? '♙' : '♟';
      case PieceType.Infiltrator:
        return isWhite ? '♘' : '♞';
      case PieceType.Beam:
        return isWhite ? '♖' : '♜';
      default:
        return '?';
    }
  };

  const netClass = (x: number, y: number): string => {
    if (!showNet || !whiteNet || !blackNet) return '';
    const key = `${x},${y}`;
    const w = whiteNet.has(key);
    const b = blackNet.has(key);
    if (w && b) return 'sovereign-contested';
    if (w) return 'sovereign-white';
    if (b) return 'sovereign-black';
    return '';
  };

  const selectedPiece = selectedPieceId
    ? gameState.pieces[selectedPieceId]
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
    piece: Piece | null,
    detected: boolean,
  ): string => {
    const coordinate = `column ${cell.coordinate.x}, row ${cell.coordinate.y}`;
    if (cell.type === CellType.GravityWell) {
      return `${coordinate}, Gravity Well, blocked`;
    }
    if (!piece) return `${coordinate}, empty`;
    const pieceName = {
      [PieceType.CommandHub]: 'Command Hub',
      [PieceType.Escort]: 'Escort',
      [PieceType.Infiltrator]: 'Infiltrator',
      [PieceType.Beam]: 'Beam',
    }[piece.type];
    return `${coordinate}, ${piece.owner} ${pieceName}${detected ? ', Target Locked' : ''}`;
  };

  return (
    <div
      ref={boardRef}
      className="subspace-board"
      style={{ gridTemplateColumns: `repeat(${gameState.boardSize}, 40px)` }}
      role="grid"
      aria-label="Game board. Use arrow keys to move between squares, Enter or Space to select and move, and Escape to cancel selection."
      aria-rowcount={gameState.boardSize}
      aria-colcount={gameState.boardSize}
    >
      {displayCells.map((cell: Cell) => {
        const piece = cell.pieceId ? gameState.pieces[cell.pieceId] : null;
        const isSelected = piece?.id === selectedPieceId;
        const isGravityWell = cell.type === CellType.GravityWell;
        const isSpoolTarget = spoolTargets.has(
          `${cell.coordinate.x},${cell.coordinate.y}`,
        );
        const detected =
          showNet && piece ? engine.isPieceDetected(piece) : false;
        const isSelectable =
          piece?.owner === localPlayer &&
          (!guidance?.selectablePieceIds ||
            guidance.selectablePieceIds.includes(piece.id));
        const isDestination = isLegalDestination(cell.coordinate);
        const isFocused = isFocusCell(cell.coordinate);

        return (
          <div
            key={`${cell.coordinate.x}-${cell.coordinate.y}`}
            className={`subspace-cell ${isGravityWell ? 'gravity-well' : ''} ${isSelected ? 'selected' : ''} ${isSpoolTarget ? 'spool-target' : ''} ${isSelectable && guidance ? 'tutorial-selectable' : ''} ${isDestination ? 'legal-destination' : ''} ${isGuidedDestination(cell.coordinate) ? 'tutorial-destination' : ''} ${isFocused ? 'tutorial-focus' : ''} ${isAdvisorFrom(cell.coordinate) ? 'advisor-from' : ''} ${isAdvisorTo(cell.coordinate) ? 'advisor-to' : ''} ${netClass(cell.coordinate.x, cell.coordinate.y)}`}
            data-testid={`cell-${cell.coordinate.x}-${cell.coordinate.y}`}
            data-cell-x={cell.coordinate.x}
            data-cell-y={cell.coordinate.y}
            role="gridcell"
            aria-rowindex={gameState.boardSize - cell.coordinate.y}
            aria-colindex={cell.coordinate.x + 1}
            aria-label={cellLabel(cell, piece, detected)}
            aria-selected={isSelected}
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
                className={`piece ${piece.owner.toLowerCase()} ${detected ? 'detected' : ''}`}
                aria-label={`${piece.type}${detected ? ', target locked' : ''}`}
              >
                {getPieceSymbol(piece.type, piece.owner)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
