import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import {
  Agent,
  AgentMove,
  agentMoveKey,
  applyAgentMove,
  isEmpAgentMove,
} from './agent';
import { evaluatePosition, PIECE_VALUE } from './evaluate';
import { HeuristicAi } from './heuristic-ai';
import {
  findImmediateWinningMove,
  moveIsTacticallyUnsafe,
  shallowBestMove,
} from './tactical';
import type { Coordinate } from '../interfaces/coordinate';
import { yieldToMain } from './cooperative-yield';

export interface MctsAiOptions {
  /** UCT iterations. 0 = heuristic only. */
  simulations?: number;
  /** Max plies in a guided rollout before quiescence / static eval. */
  maxRolloutPlies?: number;
  /** UCT exploration constant. */
  exploration?: number;
  rng?: () => number;
  /** Run shallow 1-ply eval instead of MCTS when true (or sims === 0). */
  preferShallow?: boolean;
  /**
   * ε-greedy: probability of picking a uniform random legal move in rollout.
   * Default 0.2. Set to 1 for legacy uniform rollouts.
   */
  rolloutEpsilon?: number;
  /** Extra capture/EMP plies after the rollout budget (quiescence). */
  quiescencePlies?: number;
  /**
   * Optional wall-clock cap (ms). Search stops early when exceeded.
   * Prefer for interactive Deep Lattice; leave unset for lab ladders.
   */
  timeBudgetMs?: number;
  /** Root / expand fan-out cap. */
  maxBranch?: number;
  /** Override agent name (e.g. `deep-lattice`). */
  name?: string;
  /** Yield to the event loop every N simulations (async search only). */
  yieldEvery?: number;
  /**
   * Distance-to-mate decay γ ∈ (0, 1]. Terminal rewards are discounted by
   * γ^depth so the search prefers faster wins and longer stubborn losses.
   * Default 0.99.
   */
  dtmGamma?: number;
}

/** Root search summary for UI resignation / analysis (after chooseMove*). */
export interface MctsRootSearchStats {
  rootVisits: number;
  simulationBudget: number;
  /**
   * Best child mean *undiscounted* outcome in [0, 1] from root STM.
   * Used for forced-loss resignation (DTM discount must not inflate this).
   */
  bestChildWinRate: number;
}

interface MctsNode {
  move: AgentMove | null;
  parent: MctsNode | null;
  children: MctsNode[];
  untried: AgentMove[];
  visits: number;
  /** Total DTM-discounted reward from root player's perspective in [0, 1]. */
  totalReward: number;
  /**
   * Undiscounted outcome sum in [0, 1] (raw terminal 0/1 or leaf sigmoid).
   * Win-rate reporting / Grandmaster resignation use this, not totalReward.
   */
  totalRawReward: number;
}

/**
 * Perfect-information MCTS (UCT) with tactical shortcuts, heuristic-guided
 * rollouts, and capture quiescence. Strength ≈ `simulations` (+ optional time).
 */
export class MctsAi implements Agent {
  readonly name: string;
  private readonly simulations: number;
  private readonly maxRolloutPlies: number;
  private readonly exploration: number;
  private readonly rng: () => number;
  private readonly preferShallow: boolean;
  private readonly rolloutEpsilon: number;
  private readonly quiescencePlies: number;
  private readonly timeBudgetMs: number | undefined;
  private readonly maxBranch: number;
  private readonly yieldEvery: number;
  private readonly dtmGamma: number;
  private readonly heuristic: HeuristicAi;
  /** Last root value in [-1, 1] from side-to-move's perspective (after search). */
  private lastSearchValue: number | null = null;
  private lastRootStats: MctsRootSearchStats | null = null;

  constructor(options: MctsAiOptions = {}) {
    this.simulations = options.simulations ?? 100;
    this.maxRolloutPlies = options.maxRolloutPlies ?? 40;
    this.exploration = options.exploration ?? 1.4;
    this.rng = options.rng ?? Math.random;
    this.preferShallow = options.preferShallow ?? false;
    this.rolloutEpsilon = options.rolloutEpsilon ?? 0.25;
    this.quiescencePlies = options.quiescencePlies ?? 0;
    this.timeBudgetMs = options.timeBudgetMs;
    this.maxBranch = options.maxBranch ?? 48;
    this.yieldEvery = options.yieldEvery ?? 32;
    const gamma = options.dtmGamma ?? 0.99;
    this.dtmGamma = Number.isFinite(gamma)
      ? Math.min(1, Math.max(1e-6, gamma))
      : 0.99;
    this.heuristic = new HeuristicAi(this.rng);
    this.name =
      options.name ??
      (this.simulations <= 0 ? 'mcts-heuristic' : `mcts-${this.simulations}`);
  }

  chooseMove(engine: SubspaceLatticeEngine): AgentMove | null {
    this.lastSearchValue = null;
    this.lastRootStats = null;
    const setup = this.beginSearch(engine);
    if (setup.done) {
      this.lastSearchValue = this.estimateTerminalOrShallow(engine, setup.move);
      return setup.move;
    }
    this.runSimulations(setup.root, engine, setup.rootPlayer, false);
    this.recordRootValue(setup.root);
    return this.pickRootMove(engine, setup.root);
  }

  /**
   * Root visit winrate mapped to [-1, 1] after the last `chooseMove` /
   * `chooseMoveAsync`. Null if search did not run.
   */
  getLastSearchValue(): number | null {
    return this.lastSearchValue;
  }

  /** Root visit / best-child stats from the last full MCTS search. */
  getLastRootStats(): MctsRootSearchStats | null {
    return this.lastRootStats;
  }

  /**
   * True when the last search is confident every root reply is a near-forced
   * loss (Grandmaster resignation gate). Uses undiscounted child win rates.
   */
  isForcedLossResignation(
    options: {
      minVisits?: number;
      maxBestWinRate?: number;
      minVisitFraction?: number;
    } = {},
  ): boolean {
    const stats = this.lastRootStats;
    if (!stats || stats.rootVisits <= 0) return false;
    const minVisits = options.minVisits ?? 1000;
    const maxBestWinRate = options.maxBestWinRate ?? 0.001;
    const minVisitFraction = options.minVisitFraction ?? 0.8;
    const confident =
      stats.rootVisits > minVisits ||
      stats.rootVisits > minVisitFraction * stats.simulationBudget;
    return confident && stats.bestChildWinRate < maxBestWinRate;
  }

  /**
   * Lab / Atlas: run root search and return per-child visit stats.
   * Use a high `maxBranch` (e.g. 200) when rating full opening fan-out.
   */
  analyzeRoot(engine: SubspaceLatticeEngine): {
    move: AgentMove;
    visits: number;
    /** Mean undiscounted outcome in [0,1] from root side-to-move's perspective. */
    winRate: number;
  }[] {
    this.lastSearchValue = null;
    this.lastRootStats = null;
    const setup = this.beginSearch(engine);
    if (setup.done) {
      if (!setup.move) return [];
      return [{ move: setup.move, visits: 1, winRate: 1 }];
    }
    this.runSimulations(setup.root, engine, setup.rootPlayer, false);
    this.recordRootValue(setup.root);
    return setup.root.children
      .filter((c) => c.move != null)
      .map((c) => ({
        move: c.move!,
        visits: c.visits,
        winRate: c.visits > 0 ? c.totalRawReward / c.visits : 0,
      }))
      .sort((a, b) => b.visits - a.visits);
  }

  private recordRootValue(root: MctsNode): void {
    if (root.visits <= 0) {
      this.lastSearchValue = null;
      this.lastRootStats = null;
      return;
    }
    // Search value stays on discounted backups (stubborn-defense UCT signal).
    this.lastSearchValue = 2 * (root.totalReward / root.visits) - 1;
    let bestRaw = 0;
    for (const child of root.children) {
      if (child.visits <= 0) continue;
      const rate = child.totalRawReward / child.visits;
      if (rate > bestRaw) bestRaw = rate;
    }
    this.lastRootStats = {
      rootVisits: root.visits,
      simulationBudget: this.simulations,
      bestChildWinRate: bestRaw,
    };
  }

  private estimateTerminalOrShallow(
    engine: SubspaceLatticeEngine,
    move: AgentMove | null,
  ): number | null {
    if (!move) return null;
    const child = engine.clone();
    if (!applyAgentMove(child, move)) return null;
    const winner = child.getState().winner;
    const me = engine.getState().currentPlayer;
    if (winner === me) return 1;
    if (winner && winner !== me) return -1;
    const evalScore = evaluatePosition(engine, me);
    return 2 / (1 + Math.exp(-evalScore / 200)) - 1;
  }

  /**
   * Same search as `chooseMove`, but yields periodically so the UI can paint
   * while Deep Lattice thinks.
   */
  async chooseMoveAsync(
    engine: SubspaceLatticeEngine,
    options: {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<AgentMove | null> {
    this.lastSearchValue = null;
    this.lastRootStats = null;
    options.onProgress?.(0, Math.max(1, this.simulations));
    await yieldToMain();
    const setup = this.beginSearch(engine);
    if (setup.done) {
      this.lastSearchValue = this.estimateTerminalOrShallow(engine, setup.move);
      options.onProgress?.(this.simulations, this.simulations);
      return setup.move;
    }
    await this.runSimulations(
      setup.root,
      engine,
      setup.rootPlayer,
      true,
      options,
    );
    this.recordRootValue(setup.root);
    return this.pickRootMove(engine, setup.root);
  }

  private beginSearch(engine: SubspaceLatticeEngine):
    | { done: true; move: AgentMove | null }
    | {
        done: false;
        root: MctsNode;
        rootPlayer: PlayerColor;
      } {
    const legal = engine.listLegalMoves();
    const canEmp = engine.canFireEmp();
    if (legal.length === 0 && !canEmp) return { done: true, move: null };
    if (legal.length === 1 && !canEmp) {
      return {
        done: true,
        move: { pieceId: legal[0]!.pieceId, to: legal[0]!.to },
      };
    }

    const instant = findImmediateWinningMove(engine);
    if (instant) return { done: true, move: instant };

    if (this.simulations <= 0 || this.preferShallow) {
      return {
        done: true,
        move:
          this.heuristic.chooseMove(engine) ??
          shallowBestMove(engine, this.rng),
      };
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
      totalRawReward: 0,
    };
    return { done: false, root, rootPlayer };
  }

  private runSimulations(
    root: MctsNode,
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
    asyncMode: false,
  ): void;
  private runSimulations(
    root: MctsNode,
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
    asyncMode: true,
    asyncOptions?: {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    },
  ): Promise<void>;
  private runSimulations(
    root: MctsNode,
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
    asyncMode: boolean,
    asyncOptions?: {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    },
  ): void | Promise<void> {
    const deadline =
      this.timeBudgetMs != null ? Date.now() + this.timeBudgetMs : undefined;

    const step = (i: number): boolean => {
      if (deadline != null && Date.now() >= deadline) return false;
      if (i >= this.simulations) return false;
      const simEngine = engine.clone();
      const { leaf, depth } = this.selectAndExpand(root, simEngine, rootPlayer);
      const { reward, rawReward } = this.rollout(simEngine, rootPlayer, depth);
      this.backprop(leaf, reward, rawReward);
      return true;
    };

    if (!asyncMode) {
      for (let i = 0; i < this.simulations; i++) {
        if (!step(i)) break;
      }
      return;
    }

    return (async () => {
      for (let i = 0; i < this.simulations; i++) {
        if (asyncOptions?.signal?.aborted) {
          const err = new Error('Search aborted');
          err.name = 'AbortError';
          throw err;
        }
        if (!step(i)) {
          asyncOptions?.onProgress?.(i, this.simulations);
          break;
        }
        const done = i + 1;
        const shouldReport =
          done === this.simulations ||
          done === 1 ||
          done % Math.max(this.yieldEvery, 16) === 0;
        if (shouldReport) {
          asyncOptions?.onProgress?.(done, this.simulations);
        }
        if (done % this.yieldEvery === 0) {
          await yieldToMain();
        }
      }
    })();
  }

  private pickRootMove(
    engine: SubspaceLatticeEngine,
    root: MctsNode,
  ): AgentMove | null {
    if (root.children.length === 0) {
      return shallowBestMove(engine, this.rng);
    }
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
    const candidates: AgentMove[] = legal.map((m) => ({
      pieceId: m.pieceId,
      to: m.to,
    }));
    if (engine.canFireEmp()) candidates.push({ type: 'emp' });
    if (candidates.length <= this.maxBranch) {
      return candidates;
    }

    const priority: AgentMove[] = [];
    const captures: AgentMove[] = [];
    const rest: AgentMove[] = [];
    for (const choice of candidates) {
      if (isEmpAgentMove(choice)) {
        priority.push(choice);
        continue;
      }
      const moving = engine.getPiece(choice.pieceId);
      const isHubMove = moving?.type === PieceType.CommandHub;
      if (isHubMove && engine.isTerminalOverclock()) {
        priority.push(choice);
        continue;
      }
      if (engine.getPieceAt(choice.to)) captures.push(choice);
      else rest.push(choice);
    }

    const top: AgentMove[] = [...priority, ...captures];
    const heuristicPick = this.heuristic.chooseMove(engine);
    if (
      heuristicPick &&
      !top.some((m) => agentMoveKey(m) === agentMoveKey(heuristicPick))
    ) {
      top.push(heuristicPick);
    }

    // Fill remaining slots with highest cheap-policy scores (not random).
    const scoredRest = this.cheapScoreList(engine, rest)
      .filter(
        (s) => !top.some((t) => agentMoveKey(t) === agentMoveKey(s.move)),
      )
      .sort((a, b) => b.score - a.score);

    for (const { move } of scoredRest) {
      if (top.length >= this.maxBranch) break;
      top.push(move);
    }

    return top;
  }

  private selectAndExpand(
    root: MctsNode,
    engine: SubspaceLatticeEngine,
    rootPlayer: PlayerColor,
  ): { leaf: MctsNode; depth: number } {
    let node = root;
    let depth = 0;
    while (node.untried.length === 0 && node.children.length > 0) {
      const maximizing = engine.getState().currentPlayer === rootPlayer;
      node = this.uctSelect(node, maximizing);
      if (!node.move || !applyAgentMove(engine, node.move)) {
        return { leaf: node, depth };
      }
      depth += 1;
      if (engine.getState().winner) return { leaf: node, depth };
    }

    if (node.untried.length > 0) {
      // Prefer expanding higher-prior untried moves when scored.
      const move = this.popPrioritizedUntried(engine, node);
      if (!move) return { leaf: node, depth };
      applyAgentMove(engine, move);
      depth += 1;
      const child: MctsNode = {
        move,
        parent: node,
        children: [],
        untried: engine.getState().winner ? [] : this.legalActions(engine),
        visits: 0,
        totalReward: 0,
        totalRawReward: 0,
      };
      if (child.untried.length > this.maxBranch) {
        child.untried = this.sampleByPrior(engine, child.untried, this.maxBranch);
      }
      node.children.push(child);
      return { leaf: child, depth };
    }

    return { leaf: node, depth };
  }

  private popPrioritizedUntried(
    engine: SubspaceLatticeEngine,
    node: MctsNode,
  ): AgentMove | null {
    if (node.untried.length === 0) return null;
    if (node.untried.length === 1) return node.untried.pop() ?? null;

    // Soft prior: bias expand toward cheap-policy top (no EMP clones).
    if (this.rng() < 0.55 && node.untried.length <= 32) {
      const scored = this.cheapScoreList(engine, node.untried);
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0]!.move;
      const idx = node.untried.findIndex(
        (m) => agentMoveKey(m) === agentMoveKey(best),
      );
      if (idx >= 0) {
        const [picked] = node.untried.splice(idx, 1);
        return picked ?? null;
      }
    }
    const idx = Math.min(
      node.untried.length - 1,
      Math.floor(this.rng() * node.untried.length),
    );
    const [move] = node.untried.splice(idx, 1);
    return move ?? null;
  }

  private sampleByPrior(
    engine: SubspaceLatticeEngine,
    moves: AgentMove[],
    n: number,
  ): AgentMove[] {
    if (moves.length <= n) return moves;
    const scored = this.cheapScoreList(engine, moves).sort(
      (a, b) => b.score - a.score,
    );
    const out = scored.slice(0, n).map((s) => s.move);
    const emp = moves.find(isEmpAgentMove);
    if (emp && !out.some(isEmpAgentMove)) {
      out[out.length - 1] = emp;
    }
    return out;
  }

  /**
   * Fast rollout / expand prior — material + hub geometry only.
   * Avoids HeuristicAi EMP clones on the hot path.
   */
  private cheapScoreList(
    engine: SubspaceLatticeEngine,
    moves: AgentMove[],
  ): { move: AgentMove; score: number }[] {
    const me = engine.getState().currentPlayer;
    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner !== me && p.type === PieceType.CommandHub,
    );
    const terminal = engine.isTerminalOverclock(me);
    return moves.map((move) => ({
      move,
      score: this.cheapScoreMove(engine, move, enemyHub?.position, terminal),
    }));
  }

  private cheapScoreMove(
    engine: SubspaceLatticeEngine,
    move: AgentMove,
    enemyHub: Coordinate | undefined,
    terminal: boolean,
  ): number {
    if (isEmpAgentMove(move)) {
      const me = engine.getState().currentPlayer;
      if (
        terminal &&
        engine.getEmpCharge(me) >= engine.getEmpChargeTarget(me)
      ) {
        return 400;
      }
      return 40;
    }
    const piece = engine.getPiece(move.pieceId);
    if (!piece) return Number.NEGATIVE_INFINITY;
    let score = 0;
    const target = engine.getPieceAt(move.to);
    if (target) score += PIECE_VALUE[target.type] * 10;

    // Match HeuristicAi: midgame Hub walks reset EMP charge and wander into
    // Strike range. Atlas M200vH autopsy (seed 31): MCTS Hub-moved ~60% of
    // White plies and lost by Hub-captures / EMP Lockout.
    if (engine.empEnabled() && piece.type === PieceType.CommandHub) {
      if (terminal) {
        score += 10;
      } else {
        score -= 25;
      }
    } else if (
      engine.empEnabled() &&
      engine.getEmpCharge(piece.owner) < engine.getEmpChargeTarget(piece.owner)
    ) {
      score += 8;
    }

    if (enemyHub) {
      if (terminal) {
        const before = Math.max(
          Math.abs(piece.position.x - enemyHub.x),
          Math.abs(piece.position.y - enemyHub.y),
        );
        const after = Math.max(
          Math.abs(move.to.x - enemyHub.x),
          Math.abs(move.to.y - enemyHub.y),
        );
        score += (before - after) * 12;
        const radius = engine.getEmpRadius(piece.owner);
        if (before > radius && after <= radius) score += 80;
      } else if (piece.type !== PieceType.CommandHub) {
        const before =
          Math.abs(piece.position.x - enemyHub.x) +
          Math.abs(piece.position.y - enemyHub.y);
        const after =
          Math.abs(move.to.x - enemyHub.x) + Math.abs(move.to.y - enemyHub.y);
        const closed = before - after;
        const capped =
          piece.type === PieceType.Infiltrator
            ? Math.min(closed, 3)
            : closed;
        score += capped * 3;
      }
    }
    return score;
  }

  private legalActions(engine: SubspaceLatticeEngine): AgentMove[] {
    const moves: AgentMove[] = engine.listLegalMoves().map((m) => ({
      pieceId: m.pieceId,
      to: m.to,
    }));
    if (engine.canFireEmp()) moves.push({ type: 'emp' });
    return moves;
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
    startDepth: number,
  ): { reward: number; rawReward: number } {
    let plies = 0;
    while (!engine.getState().winner && plies < this.maxRolloutPlies) {
      const actions = this.legalActions(engine);
      if (actions.length === 0) break;
      const pick = this.pickRolloutAction(engine, actions);
      applyAgentMove(engine, pick);
      plies += 1;
    }

    // Quiescence: resolve captures / EMP so leaves aren't mid-exchange.
    let q = 0;
    while (!engine.getState().winner && q < this.quiescencePlies) {
      const tactical = this.tacticalActions(engine);
      if (tactical.length === 0) break;
      const pick = this.pickRolloutAction(engine, tactical);
      applyAgentMove(engine, pick);
      q += 1;
    }

    const depth = startDepth + plies + q;
    const winner = engine.getState().winner;
    if (winner === rootPlayer) {
      return {
        rawReward: 1,
        reward: this.discountedTerminalReward(1, depth),
      };
    }
    if (winner && winner !== rootPlayer) {
      return {
        rawReward: 0,
        reward: this.discountedTerminalReward(0, depth),
      };
    }

    const evalScore = evaluatePosition(engine, rootPlayer);
    const leaf = 1 / (1 + Math.exp(-evalScore / 200));
    return { reward: leaf, rawReward: leaf };
  }

  /**
   * DTM discount on [0,1] terminals via centered ±1 scale:
   * reward = 0.5 + (undiscounted - 0.5) * γ^depth.
   * Faster wins stay nearer 1; delayed losses stay nearer 0.5 than instant mates.
   */
  private discountedTerminalReward(
    undiscounted: 0 | 1,
    depth: number,
  ): number {
    const decay = this.dtmGamma ** Math.max(0, depth);
    return 0.5 + (undiscounted - 0.5) * decay;
  }

  private tacticalActions(engine: SubspaceLatticeEngine): AgentMove[] {
    const out: AgentMove[] = [];
    for (const m of engine.listLegalMoves()) {
      if (engine.getPieceAt(m.to)) {
        out.push({ pieceId: m.pieceId, to: m.to });
      }
    }
    if (engine.canFireEmp()) out.push({ type: 'emp' });
    return out;
  }

  private pickRolloutAction(
    engine: SubspaceLatticeEngine,
    actions: AgentMove[],
  ): AgentMove {
    if (actions.length === 1) return actions[0]!;
    if (this.rng() < this.rolloutEpsilon) {
      return actions[
        Math.min(actions.length - 1, Math.floor(this.rng() * actions.length))
      ]!;
    }
    // Wide hybrid branches: score a random subset, not the full fan-out.
    const pool =
      actions.length > 16 ? this.sampleMoves(actions, 12) : actions;
    const scored = this.cheapScoreList(engine, pool);
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(3, scored.length));
    const idx = Math.min(top.length - 1, Math.floor(this.rng() * top.length));
    return top[idx]!.move;
  }

  private sampleMoves(moves: AgentMove[], n: number): AgentMove[] {
    if (moves.length <= n) return [...moves];
    const copy = [...moves];
    const out: AgentMove[] = [];
    const empIdx = copy.findIndex(isEmpAgentMove);
    if (empIdx >= 0) {
      out.push(copy.splice(empIdx, 1)[0]!);
    }
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

  private backprop(
    node: MctsNode,
    reward: number,
    rawReward: number,
  ): void {
    let current: MctsNode | null = node;
    while (current) {
      current.visits += 1;
      current.totalReward += reward;
      current.totalRawReward += rawReward;
      current = current.parent;
    }
  }
}

export interface CreateAiOptions {
  /** Wall-clock think limit for interactive play (Deep Lattice). */
  timeBudgetMs?: number;
}

/** Presets for UI strength slider (search budget). */
export const AI_STRENGTH_PRESETS = [
  { id: 'fast', label: 'Fast', simulations: 0 },
  { id: 'normal', label: 'Normal', simulations: 50 },
  { id: 'strong', label: 'Strong', simulations: 200 },
  { id: 'deep', label: 'Deep Lattice', simulations: 800 },
] as const;

export type AiStrengthId = (typeof AI_STRENGTH_PRESETS)[number]['id'];

/** True when the UI should use async yielding search. */
export function isHeavyAiStrength(strength: AiStrengthId): boolean {
  return strength === 'deep' || strength === 'strong';
}

export function createAiForStrength(
  strength: AiStrengthId,
  rng: () => number = Math.random,
  options: CreateAiOptions = {},
): Agent {
  const preset = AI_STRENGTH_PRESETS.find((p) => p.id === strength);
  const simulations = preset?.simulations ?? 50;
  if (simulations <= 0) return new HeuristicAi(rng);

  if (strength === 'deep') {
    return new MctsAi({
      simulations,
      rng,
      name: 'deep-lattice',
      maxRolloutPlies: 48,
      quiescencePlies: 10,
      rolloutEpsilon: 0.12,
      maxBranch: 56,
      exploration: 1.25,
      timeBudgetMs: options.timeBudgetMs,
      yieldEvery: 24,
    });
  }

  return new MctsAi({
    simulations,
    rng,
    quiescencePlies: strength === 'strong' ? 8 : 4,
    rolloutEpsilon: 0.2,
    timeBudgetMs: options.timeBudgetMs,
    yieldEvery: strength === 'strong' ? 16 : 8,
  });
}
