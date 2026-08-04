import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';
import { createSequenceRng, createSeededRng } from './rng';
import { evaluatePosition } from './evaluate';
import { MctsAi, createAiForStrength } from './mcts-ai';
import { findHubCaptureMove, findImmediateWinningMove, moveLeavesHubHanging } from './tactical';
import { HeuristicAi } from './heuristic-ai';
import { CLASSIC_PUZZLES, evaluatePuzzle } from '../sim/puzzles';
import { requirePieceAgentMove } from './agent';

describe('evaluate + tactical', () => {
  it('scores hub capture wins hugely for the winner', () => {
    const puzzle = CLASSIC_PUZZLES.find((p) => p.id === 'hub-mate-in-1')!;
    const live = SubspaceLatticeEngine.fromState(puzzle.state);
    const move = requirePieceAgentMove(findHubCaptureMove(live));
    expect(live.movePiece(move.pieceId, move.to)).toBe(true);
    expect(evaluatePosition(live, PlayerColor.White)).toBeGreaterThan(50_000);
    expect(evaluatePosition(live, PlayerColor.Black)).toBeLessThan(-50_000);
  });

  it('finds hub capture when available', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    state.currentPlayer = PlayerColor.Black;
    const escort = state.pieces['b-e3']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === escort.position.x &&
        c.coordinate.y === escort.position.y,
    )!;
    old.pieceId = undefined;
    escort.position = { x: 5, y: 1 };
    const cell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 1,
    )!;
    cell.pieceId = 'b-e3';
    const live = SubspaceLatticeEngine.fromState(state);
    const move = requirePieceAgentMove(findHubCaptureMove(live));
    expect(live.getPieceAt(move.to)?.type).toBe(PieceType.CommandHub);
    expect(requirePieceAgentMove(findImmediateWinningMove(live)).to).toEqual(
      move.to,
    );
  });
});

describe('MctsAi', () => {
  it('takes hub mate-in-1 via tactical shortcut', () => {
    const puzzle = CLASSIC_PUZZLES.find((p) => p.id === 'hub-mate-in-1')!;
    const ai = new MctsAi({
      simulations: 10,
      rng: createSequenceRng([0]),
    });
    const { passed } = evaluatePuzzle(puzzle, ai);
    expect(passed).toBe(true);
  });

  it('createAiForStrength fast uses heuristic name path', () => {
    const ai = createAiForStrength('fast', createSequenceRng([0]));
    expect(ai.name).toBe('heuristic');
  });

  it('returns a legal opening move with a small budget', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'classic' });
    const ai = new MctsAi({
      simulations: 8,
      maxRolloutPlies: 12,
      rng: createSeededRng(3),
    });
    const choice = requirePieceAgentMove(ai.chooseMove(engine));
    const legal = engine.listLegalMoves();
    expect(
      legal.some(
        (m) =>
          m.pieceId === choice.pieceId &&
          m.to.x === choice.to.x &&
          m.to.y === choice.to.y,
      ),
    ).toBe(true);
  });

  it('minimizes root reward when selecting an opponent reply', () => {
    const ai = new MctsAi({ simulations: 1, exploration: 0 });
    const rootFavored = {
      move: { pieceId: 'root-favored', to: { x: 0, y: 0 } },
      visits: 10,
      totalReward: 9,
    };
    const opponentFavored = {
      move: { pieceId: 'opponent-favored', to: { x: 0, y: 1 } },
      visits: 10,
      totalReward: 1,
    };
    const node = {
      children: [rootFavored, opponentFavored],
      visits: 20,
    };
    const probe = ai as unknown as {
      uctSelect: (
        parent: typeof node,
        maximizing: boolean,
      ) => typeof rootFavored;
    };

    expect(probe.uctSelect(node, true)).toBe(rootFavored);
    expect(probe.uctSelect(node, false)).toBe(opponentFavored);
  });

  it('solves hanging-hub beam puzzle', () => {
    const puzzle = CLASSIC_PUZZLES.find((p) => p.id === 'hanging-hub-beam')!;
    const ai = new MctsAi({ simulations: 5, rng: createSequenceRng([0]) });
    expect(evaluatePuzzle(puzzle, ai).passed).toBe(true);
  });

  it('refuses material bait that leaves the Command Hub hanging', () => {
    const puzzle = CLASSIC_PUZZLES.find(
      (p) => p.id === 'avoid-hanging-hub-mate',
    )!;
    const live = SubspaceLatticeEngine.fromState(puzzle.state);
    const bait = { pieceId: 'w-e2', to: { x: 8, y: 3 } };
    expect(moveLeavesHubHanging(live, bait)).toBe(true);

    for (const strength of ['fast', 'normal', 'strong', 'deep'] as const) {
      const ai =
        strength === 'deep'
          ? new MctsAi({
              simulations: 24,
              quiescencePlies: 4,
              rng: createSequenceRng([0]),
            })
          : createAiForStrength(strength, createSequenceRng([0]));
      expect(evaluatePuzzle(puzzle, ai).passed).toBe(true);
    }
  });

  it('strong preset name encodes budget', () => {
    const ai = createAiForStrength('strong');
    expect(ai.name).toBe('mcts-200');
  });

  it('deep preset brands as deep-lattice', () => {
    const ai = createAiForStrength('deep');
    expect(ai.name).toBe('deep-lattice');
  });

  it('chooseMoveAsync matches chooseMove on a forced win', async () => {
    const puzzle = CLASSIC_PUZZLES.find((p) => p.id === 'hub-mate-in-1')!;
    const live = SubspaceLatticeEngine.fromState(puzzle.state);
    const ai = new MctsAi({
      simulations: 8,
      rng: createSequenceRng([0]),
    });
    const sync = ai.chooseMove(live);
    const asyncMove = await ai.chooseMoveAsync(live);
    expect(sync).toEqual(asyncMove);
  });

  it('DTM discount prefers delayed losses and faster wins', () => {
    const ai = new MctsAi({ dtmGamma: 0.99 });
    const probe = ai as unknown as {
      discountedTerminalReward: (u: 0 | 1, depth: number) => number;
    };
    const instantLoss = probe.discountedTerminalReward(0, 0);
    const delayedLoss = probe.discountedTerminalReward(0, 10);
    const instantWin = probe.discountedTerminalReward(1, 0);
    const delayedWin = probe.discountedTerminalReward(1, 10);
    expect(instantLoss).toBe(0);
    expect(instantWin).toBe(1);
    expect(delayedLoss).toBeGreaterThan(instantLoss);
    expect(delayedWin).toBeLessThan(instantWin);
    expect(delayedLoss).toBeCloseTo(0.5 - 0.5 * 0.99 ** 10, 10);
  });

  it('isForcedLossResignation requires confident near-zero raw winrate', () => {
    const ai = new MctsAi({ simulations: 100 });
    const probe = ai as unknown as {
      lastRootStats: {
        rootVisits: number;
        simulationBudget: number;
        bestChildWinRate: number;
      } | null;
    };
    expect(ai.isForcedLossResignation()).toBe(false);

    probe.lastRootStats = {
      rootVisits: 90,
      simulationBudget: 100,
      bestChildWinRate: 0,
    };
    expect(ai.isForcedLossResignation()).toBe(true);

    probe.lastRootStats = {
      rootVisits: 50,
      simulationBudget: 100,
      bestChildWinRate: 0,
    };
    expect(ai.isForcedLossResignation()).toBe(false);

    probe.lastRootStats = {
      rootVisits: 1200,
      simulationBudget: 800,
      bestChildWinRate: 0.002,
    };
    expect(ai.isForcedLossResignation()).toBe(false);

    probe.lastRootStats = {
      rootVisits: 1200,
      simulationBudget: 800,
      bestChildWinRate: 0.0005,
    };
    expect(ai.isForcedLossResignation()).toBe(true);
  });
});

describe('heuristic still solves classic puzzles', () => {
  it('passes classic suite', () => {
    const ai = new HeuristicAi(createSequenceRng([0]));
    for (const puzzle of CLASSIC_PUZZLES) {
      expect(evaluatePuzzle(puzzle, ai).passed).toBe(true);
    }
  });
});
