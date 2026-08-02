import { useMemo, useState } from 'react';
import {
  CellType,
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type GameState,
} from '@subspace-lattice/core';
import { Board } from './Board';
import './SensorNetLab.scss';

const fleetRules = resolveRulesConfig('hybrid-fleet');

interface PieceSpec {
  id: string;
  type: PieceType;
  owner: PlayerColor;
  x: number;
  y: number;
}

function stateWith(pieces: PieceSpec[], plyCount = 12): GameState {
  const engine = new SubspaceLatticeEngine({ rules: fleetRules });
  const state = engine.getStateCopy();
  for (const cell of state.cells) delete cell.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  for (const spec of pieces) {
    state.pieces[spec.id] = {
      id: spec.id,
      type: spec.type,
      owner: spec.owner,
      position: { x: spec.x, y: spec.y },
    };
    const cell = state.cells.find(
      (c) => c.coordinate.x === spec.x && c.coordinate.y === spec.y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(
        `Invalid lab cell ${spec.id} @ ${spec.x},${spec.y} (Gravity Well is 5,5)`,
      );
    }
    cell.pieceId = spec.id;
  }
  return state;
}

interface LabStep {
  id: string;
  title: string;
  kicker: string;
  explanation: string;
  /** Piece to keep selected so Power Relay amber lines draw. */
  selectId?: string;
  coverageNote?: string;
  createState: () => GameState;
}

const STEPS: readonly LabStep[] = [
  {
    id: 'hub-alone',
    title: 'The Hub is the power plant',
    kicker: 'Radius 3',
    explanation:
      'Blue cells are White’s Sensor Net (Sovereign Space). A lone Command Hub radiates Chebyshev radius 3 — the big halo. Nothing else is linked yet, so nothing else adds coverage.',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 2 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 5, y: 10 },
      ]),
  },
  {
    id: 'escort-link',
    title: 'Escorts extend the fringe',
    kicker: 'Linked · relay path',
    explanation:
      'Amber dashed lines are Power Relay (Options → Power relay). The tip Escort is selected: the path hops Hub → Escort → tip. Linked Escorts each add radius 1. Watch blue push past the Hub blob.',
    selectId: 'w-e2',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 1 },
        { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 3 },
        { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 5 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 4, y: 10 },
      ]),
  },
  {
    id: 'any-hop',
    title: 'Any friendly can carry the hop',
    kicker: 'Chain ≠ radiate',
    explanation:
      'Link distance is Chebyshev ≤2 between friendlies. A Beam (or Infiltrator) does not radiate — but it can sit in the chain so a far Escort stays linked. The amber relay still reaches the tip.',
    selectId: 'w-e2',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 1 },
        { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 3 },
        { id: 'w-b1', type: PieceType.Beam, owner: PlayerColor.White, x: 4, y: 5 },
        { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 7 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 10 },
      ]),
  },
  {
    id: 'dark-escort',
    title: 'Break the chain — go dark',
    kicker: 'Unlinked Escort',
    explanation:
      'This tip Escort is more than two hops from the chain. No amber relay. No extra blue from it. Reconnect (step closer) and the fringe returns.',
    selectId: 'w-e-dark',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 1 },
        { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 3 },
        // Chebyshev 4 from e1 → unlinked (well is 5,5 — stay on file 4)
        { id: 'w-e-dark', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 7 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 4, y: 10 },
      ]),
  },
  {
    id: 'contested',
    title: 'Overlap helps neither side',
    kicker: 'Contested space',
    explanation:
      'Where blue and red meet, cells are contested — purple mix on the board. Contested coverage counts for neither fleet toward Sector Integration (45%).',
    selectId: 'w-e2',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 2 },
        { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 4 },
        { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 6 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 8, y: 8 },
        { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 7, y: 6 },
        { id: 'b-e2', type: PieceType.Escort, owner: PlayerColor.Black, x: 6, y: 6 },
      ]),
  },
  {
    id: 'target-lock',
    title: 'Stand in their glow — Target Locked',
    kicker: 'Suppression',
    explanation:
      'Black’s Escort sits inside White’s blue net. It is Target Locked: special systems die; only one orthogonal step. Projecting net can be as strong as capturing.',
    selectId: 'w-e2',
    createState: () =>
      stateWith([
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 2 },
        { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 4 },
        { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 6 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 10 },
        { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 7 },
      ]),
  },
  {
    id: 'initiative-relay',
    title: 'Initiative Relay',
    kicker: 'Why White gets an extra Escort',
    explanation:
      'White moves first — and in this game that is usually a liability. You commit ships and net first; Black answers with information you do not have yet. Playtests showed first seat losing too often under equal fleets, so White starts with one extra Escort already forward: the Initiative Relay. Same linking rules — visible compensation for going first, not a secret score bonus.',
    selectId: 'w-e-relay',
    createState: () =>
      new SubspaceLatticeEngine({ rules: fleetRules }).getStateCopy(),
  },
];

function resolveSelectId(step: LabStep, state: GameState): string | undefined {
  if (step.id === 'initiative-relay') {
    const escorts = Object.values(state.pieces).filter(
      (p) => p.owner === PlayerColor.White && p.type === PieceType.Escort,
    );
    escorts.sort((a, b) => b.position.y - a.position.y);
    return escorts[0]?.id;
  }
  return step.selectId;
}

/**
 * Interactive Sensor Net walkthrough — live Board, Power Relay forced on.
 * Embedded in Visual Rules (`/rules`) and usable standalone.
 */
export function SensorNetLab() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)]!;
  const engine = useMemo(
    () => SubspaceLatticeEngine.fromState(step.createState(), fleetRules),
    [step],
  );
  const state = engine.getState();
  const selectId = resolveSelectId(step, state);
  const whiteCoverage = engine.sectorControlRatio(PlayerColor.White);
  const blackCoverage = engine.sectorControlRatio(PlayerColor.Black);

  return (
    <div className="sensor-net-lab">
      <div className="sensor-net-lab__board">
        <Board
          gameState={state}
          engine={engine}
          localPlayer="OBSERVER"
          interactive={false}
          showPowerRelay
          guidedSelectionId={selectId}
          onMovePiece={() => false}
          onPlacePiece={() => undefined}
          guidance={
            selectId && state.pieces[selectId]
              ? {
                  selectablePieceIds: [selectId],
                  focusCells: [state.pieces[selectId].position],
                }
              : undefined
          }
        />
        <p className="sensor-net-lab__hud" aria-live="polite">
          Coverage · White {(whiteCoverage * 100).toFixed(0)}% · Black{' '}
          {(blackCoverage * 100).toFixed(0)}%
          {selectId ? ' · Power relay on selected ship' : ''}
        </p>
      </div>

      <aside className="sensor-net-lab__coach">
        <p className="sensor-net-lab__kicker">
          Sensor Net lab · {stepIndex + 1}/{STEPS.length}
        </p>
        <p className="sensor-net-lab__concept">{step.kicker}</p>
        <h2>{step.title}</h2>
        <p>{step.explanation}</p>
        <div className="sensor-net-lab__actions">
          <div className="sensor-net-lab__dots" role="tablist" aria-label="Lab steps">
            {STEPS.map((s, index) => (
              <button
                key={s.id}
                type="button"
                className={index === stepIndex ? 'is-current' : ''}
                aria-label={s.title}
                title={s.title}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
              />
            ))}
          </div>
          <div className="sensor-net-lab__nav">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="sensor-net-lab__next"
              disabled={stepIndex >= STEPS.length - 1}
              onClick={() =>
                setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
              }
            >
              Next
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
