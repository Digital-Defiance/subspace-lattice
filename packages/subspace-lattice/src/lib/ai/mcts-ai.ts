import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import {
  Agent,
  AgentMove,
  agentMoveKey,
  applyAgentMove,
  isEmpAgentMove,
} from './agent';
import { evaluatePosition } from './evaluate';
import { HeuristicAi } from './heuristic-ai';
import {
  findImmediateWinningMove,
  moveIsTacticallyUnsafe,
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
    const canEmp = engine.canFireEmp();
    if (legal.length === 0 && !canEmp) return null;
    if (legal.length === 1 && !canEmp) {
      return { pieceId: legal[0]!.pieceId, to: legal[0]!.to };
    }

    const instant = findImmediateWinningMove(engine);
    if (instant) return instant;

    // Do not short-circuit on greedy captures — Heuristic often hangs pieces.
    // Only skip search when the heuristic is a safe quiet move and sims are 0.
    if (this.simulations <= 0 || this.preferShallow) {
      return new HeuristicAi(this.rng).chooseMove(engine) ??
        shallowBestMove(engine, this.rng);
    }

    const rootMoves = this.selectRootMoves(engine, legal);
    const rootPlayer = engine.getState().currentPlayer;
    const root: MctsNode = {
      move: null,
      parent: null,
      children: [],
      untried: [...rootMoves],
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

    // Prefer the most-visited child that isn't a clear tactical blunder.
    const ranked = [...root.children].sort((a, b) => b.visits - a.visits);
    for (const child of ranked) {
      if (!child.move) continue;
      if (!moveIsTacticallyUnsafe(engine, child.move)) {
        return child.move;
      }
    }
    return ranked[0]!.move;
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
    const candidates: AgentMove[] = legal.map((m) => ({
      pieceId: m.pieceId,
      to: m.to,
    }));
    if (engine.canFireEmp()) candidates.push({ type: 'emp' });
    if (candidates.length <= MAX_ROOT) {
      return candidates;
    }

    const captures: AgentMove[] = [];
    const rest: AgentMove[] = [];
    for (const choice of candidates) {
      if (isEmpAgentMove(choice)) {
        rest.push(choice);
        continue;
      }
      if (engine.getPieceAt(choice.to)) captures.push(choice);
      else rest.push(choice);
    }

    const top: AgentMove[] = [...captures];
    const heuristic = new HeuristicAi(this.rng).chooseMove(engine);
    if (
      heuristic &&
      !top.some((m) => agentMoveKey(m) === agentMoveKey(heuristic))
    ) {
      top.push(heuristic);
    }

    const pool = rest.filter(
      (m) => !top.some((t) => agentMoveKey(t) === agentMoveKey(m)),
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
      if (!node.move || !applyAgentMove(engine, node.move)) {
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
      applyAgentMove(engine, move);
      const child: MctsNode = {
        move,
        parent: node,
        children: [],
        untried: engine.getState().winner ? [] : this.legalActions(engine),
        visits: 0,
        totalReward: 0,
      };
      if (child.untried.length > 48) {
        child.untried = this.sampleMoves(child.untried, 48);
      }
      node.children.push(child);
      return child;
    }

    return node;
  }

  private legalActions(engine: SubspaceLatticeEngine): AgentMove[] {
    const moves: AgentMove[] = engine.listLegalMoves().map((m) => ({
      pieceId: m.pieceId,
      to: m.to,
    }));
    if (engine.canFireEmp()) moves.push({ type: 'emp' });
    return moves;
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
      const actions = this.legalActions(engine);
      if (actions.length === 0) break;
      const idx = Math.min(
        actions.length - 1,
        Math.floor(this.rng() * actions.length),
      );
      applyAgentMove(engine, actions[idx]!);
      plies += 1;
    }

    const winner = engine.getState().winner;
    if (winner === rootPlayer) return 1;
    if (winner && winner !== rootPlayer) return 0;

    const evalScore = evaluatePosition(engine, rootPlayer);
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
