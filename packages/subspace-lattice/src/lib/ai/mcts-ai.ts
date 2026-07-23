import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { Agent, AgentMove } from './agent';
import { evaluatePosition } from './evaluate';
import { HeuristicAi } from './heuristic-ai';
import {
  filterMovesAvoidingHubMate,
  findImmediateWinningMove,
  moveLeavesHubHanging,
  shallowBestMove,
} from './tactical';

export interface MctsAiOptions {
  /** UCT iterations. 0 = heuristic only. */
  simulations?: number;
  /** Max plies in a random rollout before static eval. */
  maxRolloutPlies?: number;
  /** UCT exploration constant. */
  exploration?: number;
  rng?: () => number;
  /** Run shallow 1-ply eval instead of MCTS when true (or sims === 0). */
  preferShallow?: boolean;
}

interface MctsNode {
  move: AgentMove | null;
  parent: MctsNode | null;
  children: MctsNode[];
  untried: AgentMove[];
  visits: number;
  /** Total reward from root player's perspective in [0, 1]. */
  totalReward: number;
}

function moveKey(m: AgentMove): string {
  return `${m.pieceId}:${m.to.x},${m.to.y}`;
}

/**
 * Perfect-information MCTS (UCT) with tactical shortcuts.
 * Strength ≈ `simulations` budget.
 */
export class MctsAi implements Agent {
  readonly name: string;
  private readonly simulations: number;
  private readonly maxRolloutPlies: number;
  private readonly exploration: number;
  private readonly rng: () => number;
  private readonly preferShallow: boolean;

  constructor(options: MctsAiOptions = {}) {
    this.simulations = options.simulations ?? 100;
    this.maxRolloutPlies = options.maxRolloutPlies ?? 40;
    this.exploration = options.exploration ?? 1.4;
    this.rng = options.rng ?? Math.random;
    this.preferShallow = options.preferShallow ?? false;
    this.name =
      this.simulations <= 0
        ? 'mcts-heuristic'
        : `mcts-${this.simulations}`;
  }

  chooseMove(engine: SubspaceLatticeEngine): AgentMove | null {
    const legal = engine.listLegalMoves();
    if (legal.length === 0) return null;
    if (legal.length === 1) {
      return { pieceId: legal[0]!.pieceId, to: legal[0]!.to };
    }

    const instant = findImmediateWinningMove(engine);
    if (instant) return instant;

    // Trust 1-ply material takes when they do not leave the hub hanging;
    // MCTS rollouts are too noisy at low budgets to recover from mate-blind greed.
    const heuristicChoice = new HeuristicAi(this.rng).chooseMove(engine);
    if (
      heuristicChoice &&
      engine.getPieceAt(heuristicChoice.to) &&
      !moveLeavesHubHanging(engine, heuristicChoice)
    ) {
      return heuristicChoice;
    }

    if (this.simulations <= 0 || this.preferShallow) {
      return heuristicChoice ?? shallowBestMove(engine, this.rng);
    }

    // Cap branching for hybrid infiltrator warps: keep tactical + sample.
    // Prefer root moves that avoid an immediate Surgical Strike reply.
    const rootMoves = this.selectRootMoves(engine, legal);
    const rootPlayer = engine.getState().currentPlayer;
    const root: MctsNode = {
      move: null,
      parent: null,
      children: [],
      untried: rootMoves.map((m) => ({ pieceId: m.pieceId, to: m.to })),
      visits: 0,
      totalReward: 0,
    };

    for (let i = 0; i < this.simulations; i++) {
      const simEngine = engine.clone();
      const leaf = this.selectAndExpand(root, simEngine, rootPlayer);
      const reward = this.rollout(simEngine, rootPlayer);
      this.backprop(leaf, reward);
    }

    if (root.children.length === 0) {
      return shallowBestMove(engine, this.rng);
    }

    let best = root.children[0]!;
    for (const child of root.children) {
      if (child.visits > best.visits) best = child;
    }
    return best.move;
  }

  private selectRootMoves(
    engine: SubspaceLatticeEngine,
    legal: Array<{
      pieceId: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }>,
  ): AgentMove[] {
    const MAX_ROOT = 48;
    const candidates = filterMovesAvoidingHubMate(
      engine,
      legal.map((m) => ({ pieceId: m.pieceId, to: m.to })),
    );
    if (candidates.length <= MAX_ROOT) {
      return candidates;
    }

    // Prefer captures, then heuristic pick, then random fill (avoid scoring all).
    const captures: AgentMove[] = [];
    const rest: AgentMove[] = [];
    for (const choice of candidates) {
      if (engine.getPieceAt(choice.to)) captures.push(choice);
      else rest.push(choice);
    }

    const top: AgentMove[] = [...captures];
    const heuristic = new HeuristicAi(this.rng).chooseMove(engine);
    if (
      heuristic &&
      !top.some((m) => moveKey(m) === moveKey(heuristic))
    ) {
      top.push(heuristic);
    }

    const pool = rest.filter(
      (m) => !top.some((t) => moveKey(t) === moveKey(m)),
    );
    while (top.length < MAX_ROOT && pool.length > 0) {
      const idx = Math.min(
        pool.length - 1,
        Math.floor(this.rng() * pool.length),
      );
      const [picked] = pool.splice(idx, 1);
      if (picked) top.push(picked);
    }
    return top;
  }

  private selectAndExpand(
    root: MctsNode,
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
  ): MctsNode {
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0) {
      const maximizing =
        engine.getState().currentPlayer === rootPlayer;
      node = this.uctSelect(node, maximizing);
      if (!node.move || !engine.movePiece(node.move.pieceId, node.move.to)) {
        return node;
      }
      if (engine.getState().winner) return node;
    }

    if (node.untried.length > 0) {
      const idx = Math.min(
        node.untried.length - 1,
        Math.floor(this.rng() * node.untried.length),
      );
      const [move] = node.untried.splice(idx, 1);
      if (!move) return node;
      engine.movePiece(move.pieceId, move.to);
      const child: MctsNode = {
        move,
        parent: node,
        children: [],
        untried: engine.getState().winner
          ? []
          : engine.listLegalMoves().map((m) => ({
              pieceId: m.pieceId,
              to: m.to,
            })),
        visits: 0,
        totalReward: 0,
      };
      // Cap child untried similarly
      if (child.untried.length > 48) {
        child.untried = this.sampleMoves(child.untried, 48);
      }
      node.children.push(child);
      return child;
    }

    return node;
  }

  private sampleMoves(moves: AgentMove[], n: number): AgentMove[] {
    const copy = [...moves];
    const out: AgentMove[] = [];
    while (out.length < n && copy.length > 0) {
      const idx = Math.min(
        copy.length - 1,
        Math.floor(this.rng() * copy.length),
      );
      const [m] = copy.splice(idx, 1);
      if (m) out.push(m);
    }
    return out;
  }

  private uctSelect(node: MctsNode, maximizing: boolean): MctsNode {
    let best = node.children[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const child of node.children) {
      const rootReward =
        child.visits === 0 ? 1 : child.totalReward / child.visits;
      // Rewards are stored from the root player's perspective. At an
      // opponent node, UCT must prefer replies that minimize that reward;
      // otherwise every simulated opponent cooperates with the root.
      const exploit = maximizing ? rootReward : 1 - rootReward;
      const explore =
        this.exploration *
        Math.sqrt(Math.log(node.visits + 1) / (child.visits + 1e-9));
      const score = exploit + explore;
      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    return best;
  }

  private rollout(
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
  ): number {
    let plies = 0;
    while (!engine.getState().winner && plies < this.maxRolloutPlies) {
      const legal = engine.listLegalMoves();
      if (legal.length === 0) break;
      const idx = Math.min(
        legal.length - 1,
        Math.floor(this.rng() * legal.length),
      );
      const move = legal[idx]!;
      engine.movePiece(move.pieceId, move.to);
      plies += 1;
    }

    const winner = engine.getState().winner;
    if (winner === rootPlayer) return 1;
    if (winner && winner !== rootPlayer) return 0;

    const evalScore = evaluatePosition(engine, rootPlayer);
    // Softmap eval to (0,1)
    return 1 / (1 + Math.exp(-evalScore / 200));
  }

  private backprop(node: MctsNode, reward: number): void {
    let current: MctsNode | null = node;
    while (current) {
      current.visits += 1;
      current.totalReward += reward;
      current = current.parent;
    }
  }
}

/** Presets for UI strength slider (search budget). */
export const AI_STRENGTH_PRESETS = [
  { id: 'fast', label: 'Fast', simulations: 0 },
  { id: 'normal', label: 'Normal', simulations: 50 },
  { id: 'strong', label: 'Strong', simulations: 200 },
] as const;

export type AiStrengthId = (typeof AI_STRENGTH_PRESETS)[number]['id'];

export function createAiForStrength(
  strength: AiStrengthId,
  rng: () => number = Math.random,
): Agent {
  const preset = AI_STRENGTH_PRESETS.find((p) => p.id === strength);
  const simulations = preset?.simulations ?? 50;
  if (simulations <= 0) return new HeuristicAi(rng);
  return new MctsAi({ simulations, rng });
}
