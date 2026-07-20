import {
  Cell,
  CellType,
  Coordinate,
  GameState,
  Piece,
  PieceType,
  PlayerColor,
  WinnerReason,
} from './interfaces';
import {
  RulesConfig,
  RulesVersion,
  resolveRulesConfig,
  usesSensorNet,
} from './rules/rules-config';

export type EngineOptions =
  | number
  | {
      boardSize?: number;
      rules?: RulesConfig;
      rulesVersion?: RulesVersion;
    };

export interface MoveInfo {
  moverType: PieceType;
  capturedType?: PieceType;
  spoolAnnounce?: boolean;
  spoolFailed?: boolean;
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function chebyshev(a: Coordinate, b: Coordinate): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export class SubspaceLatticeEngine {
  private state: GameState;
  private readonly BOARD_SIZE: number;
  private readonly rules: RulesConfig;
  private lastMoveInfo: MoveInfo | null = null;

  constructor(options: EngineOptions = 11) {
    const resolved = SubspaceLatticeEngine.resolveOptions(options);
    this.rules = resolved.rules;
    this.BOARD_SIZE = resolved.rules.boardSize;
    this.state = this.initializeGame(
      this.BOARD_SIZE,
      this.rules.version,
      this.rules.firstPlayerRelayCount ?? 0,
    );
  }

  private static resolveOptions(options: EngineOptions): {
    rules: RulesConfig;
  } {
    if (typeof options === 'number') {
      return {
        rules: resolveRulesConfig('classic', { boardSize: options }),
      };
    }
    if (options.rules) {
      return {
        rules: {
          ...options.rules,
          boardSize: options.boardSize ?? options.rules.boardSize,
        },
      };
    }
    return {
      rules: resolveRulesConfig(options.rulesVersion ?? 'classic', {
        boardSize: options.boardSize,
      }),
    };
  }

  /**
   * Hydrate an engine from a persisted/authoritative game state snapshot.
   * Pass `rules` to preserve non-default knobs (sim/search); otherwise the
   * version's default RulesConfig is used (persisted rooms).
   */
  public static fromState(
    state: GameState,
    rules?: RulesConfig,
  ): SubspaceLatticeEngine {
    const version = rules?.version ?? state.rulesVersion ?? 'classic';
    const engine = new SubspaceLatticeEngine(
      rules
        ? { rules: { ...rules, boardSize: state.boardSize } }
        : { boardSize: state.boardSize, rulesVersion: version },
    );
    engine.state = structuredClone(state);
    if (!engine.state.rulesVersion) {
      engine.state.rulesVersion = version;
    }
    return engine;
  }

  /** Deep-clone engine + state for search / sim branching. */
  public clone(): SubspaceLatticeEngine {
    return SubspaceLatticeEngine.fromState(this.getState(), this.rules);
  }

  public getRules(): RulesConfig {
    return this.rules;
  }

  public getLastMoveInfo(): MoveInfo | null {
    return this.lastMoveInfo;
  }

  public isHybrid(): boolean {
    return usesSensorNet(this.rules.version);
  }

  public usesInfiltratorSpool(): boolean {
    return this.rules.infiltratorSpoolUp;
  }

  private initializeGame(
    boardSize: number,
    rulesVersion: RulesVersion,
    firstPlayerRelayCount: number,
  ): GameState {
    const cells: Cell[] = [];
    for (let x = 0; x < boardSize; x++) {
      for (let y = 0; y < boardSize; y++) {
        cells.push({
          coordinate: { x, y },
          type: CellType.Empty,
        });
      }
    }

    const pieces: Record<string, Piece> = {};

    const addPiece = (
      id: string,
      type: PieceType,
      owner: PlayerColor,
      x: number,
      y: number,
    ) => {
      pieces[id] = { id, type, owner, position: { x, y } };
      const cell = cells.find(
        (c) => c.coordinate.x === x && c.coordinate.y === y,
      );
      if (cell) cell.pieceId = id;
    };

    const back = boardSize - 1;

    // White starting pieces
    addPiece('w-ch', PieceType.CommandHub, PlayerColor.White, 5, 0);
    addPiece('w-e1', PieceType.Escort, PlayerColor.White, 4, 0);
    addPiece('w-e2', PieceType.Escort, PlayerColor.White, 6, 0);
    addPiece('w-e3', PieceType.Escort, PlayerColor.White, 5, 1);
    addPiece('w-i1', PieceType.Infiltrator, PlayerColor.White, 3, 0);
    addPiece('w-i2', PieceType.Infiltrator, PlayerColor.White, 7, 0);
    addPiece('w-b1', PieceType.Beam, PlayerColor.White, 2, 0);
    addPiece('w-b2', PieceType.Beam, PlayerColor.White, 8, 0);
    if (firstPlayerRelayCount === 1) {
      // A visible, connected reinforcement for the player who must commit
      // first. It begins at the edge of the opening net, linked through the
      // central Escort, so the compensation is spatial as well as material.
      addPiece('w-e4', PieceType.Escort, PlayerColor.White, 5, 3);
    } else if (firstPlayerRelayCount >= 2) {
      // Two relays remain horizontally mirrored around the Hub.
      addPiece('w-e4', PieceType.Escort, PlayerColor.White, 4, 2);
      addPiece('w-e5', PieceType.Escort, PlayerColor.White, 6, 2);
    }

    // Black starting pieces (mirrored on far rank)
    addPiece('b-ch', PieceType.CommandHub, PlayerColor.Black, 5, back);
    addPiece('b-e1', PieceType.Escort, PlayerColor.Black, 4, back);
    addPiece('b-e2', PieceType.Escort, PlayerColor.Black, 6, back);
    addPiece('b-e3', PieceType.Escort, PlayerColor.Black, 5, back - 1);
    addPiece('b-i1', PieceType.Infiltrator, PlayerColor.Black, 3, back);
    addPiece('b-i2', PieceType.Infiltrator, PlayerColor.Black, 7, back);
    addPiece('b-b1', PieceType.Beam, PlayerColor.Black, 2, back);
    addPiece('b-b2', PieceType.Beam, PlayerColor.Black, 8, back);

    // Add central gravity well
    const center = Math.floor(boardSize / 2);
    const centerCell = cells.find(
      (c) => c.coordinate.x === center && c.coordinate.y === center,
    );
    if (centerCell) centerCell.type = CellType.GravityWell;

    return {
      boardSize,
      cells,
      pieces,
      currentPlayer: PlayerColor.White,
      rulesVersion,
    };
  }

  /** Live state reference — clone before mutating branches. */
  public getState(): GameState {
    return this.state;
  }

  /** Snapshot copy of current state. */
  public getStateCopy(): GameState {
    return structuredClone(this.state);
  }

  public getCell(coord: Coordinate): Cell | undefined {
    return this.state.cells.find(
      (c) => c.coordinate.x === coord.x && c.coordinate.y === coord.y,
    );
  }

  public getPiece(id: string): Piece | undefined {
    return this.state.pieces[id];
  }

  public getPieceAt(coord: Coordinate): Piece | undefined {
    const cell = this.getCell(coord);
    if (cell?.pieceId) {
      return this.state.pieces[cell.pieceId];
    }
    return undefined;
  }

  public isValidCoordinate(coord: Coordinate): boolean {
    return (
      coord.x >= 0 &&
      coord.x < this.BOARD_SIZE &&
      coord.y >= 0 &&
      coord.y < this.BOARD_SIZE
    );
  }

  public placePiece(piece: Piece): boolean {
    if (this.state.winner) return false;
    if (!this.isValidCoordinate(piece.position)) return false;

    const cell = this.getCell(piece.position);
    if (!cell || cell.type === CellType.GravityWell || cell.pieceId)
      return false;

    this.state.pieces[piece.id] = piece;
    cell.pieceId = piece.id;
    return true;
  }

  public hasAvailableMoves(color: PlayerColor): boolean {
    return this.listLegalMoves(color).length > 0;
  }

  /** All legal moves for a side (or the current player if omitted). */
  public listLegalMoves(
    color: PlayerColor = this.state.currentPlayer,
  ): Array<{ pieceId: string; from: Coordinate; to: Coordinate }> {
    const moves: Array<{ pieceId: string; from: Coordinate; to: Coordinate }> =
      [];
    const pieces = Object.values(this.state.pieces).filter(
      (p) => p.owner === color,
    );
    const nets = this.buildSensorNetContext();

    for (const piece of pieces) {
      for (let x = 0; x < this.BOARD_SIZE; x++) {
        for (let y = 0; y < this.BOARD_SIZE; y++) {
          const to = { x, y };
          if (this.canMovePieceWithNets(piece, to, nets)) {
            moves.push({
              pieceId: piece.id,
              from: { ...piece.position },
              to,
            });
          }
        }
      }
    }
    return moves;
  }

  /** Preview whether a piece could move to a square (ignores whose turn it is). */
  public canMovePiece(piece: Piece, to: Coordinate): boolean {
    return this.canMovePieceWithNets(piece, to, this.buildSensorNetContext());
  }

  private canMovePieceWithNets(
    piece: Piece,
    to: Coordinate,
    nets: SensorNetContext,
  ): boolean {
    if (!this.isValidCoordinate(to)) return false;
    const targetCell = this.getCell(to);
    if (!targetCell || targetCell.type === CellType.GravityWell) return false;

    if (targetCell.pieceId) {
      const targetPiece = this.getPiece(targetCell.pieceId);
      if (targetPiece?.owner === piece.owner) return false;
    }

    // Pending spool execute may target a now-illegal square (failed jump still legal as an action).
    if (
      this.usesInfiltratorSpool() &&
      piece.type === PieceType.Infiltrator &&
      piece.spoolTarget &&
      piece.spoolTarget.x === to.x &&
      piece.spoolTarget.y === to.y
    ) {
      return true;
    }

    return this.isValidMove(piece, to, nets);
  }

  public movePiece(pieceId: string, to: Coordinate): boolean {
    if (this.state.winner) return false;

    const piece = this.getPiece(pieceId);
    if (!piece || piece.owner !== this.state.currentPlayer) return false;
    if (!this.canMovePiece(piece, to)) return false;

    this.lastMoveInfo = { moverType: piece.type };
    const mover = piece.owner;
    const nets = this.buildSensorNetContext();
    const detected = this.isPieceDetected(piece);

    // Navigational Target Lock: announce or execute
    if (
      this.usesInfiltratorSpool() &&
      piece.type === PieceType.Infiltrator &&
      !detected
    ) {
      if (piece.spoolTarget) {
        // Execute turn — only the announced coordinate is allowed.
        if (
          piece.spoolTarget.x !== to.x ||
          piece.spoolTarget.y !== to.y
        ) {
          return false;
        }
        const targetOk = this.isValidWarpDestination(piece, to, nets);
        delete piece.spoolTarget;
        if (!targetOk) {
          this.lastMoveInfo = {
            moverType: PieceType.Infiltrator,
            spoolFailed: true,
          };
          this.endPly(mover);
          return true;
        }
        // fall through to physical move + capture
      } else {
        // Announce turn — lock coordinates, do not move.
        if (!this.isValidWarpDestination(piece, to, nets)) return false;
        piece.spoolTarget = { x: to.x, y: to.y };
        this.lastMoveInfo = {
          moverType: PieceType.Infiltrator,
          spoolAnnounce: true,
        };
        this.endPly(mover);
        return true;
      }
    }

    // Detected / ortho move clears any stale spool lock.
    if (piece.spoolTarget) {
      delete piece.spoolTarget;
    }

    const targetCell = this.getCell(to)!;

    // Handle capture
    if (targetCell.pieceId) {
      const targetPiece = this.getPiece(targetCell.pieceId);
      if (targetPiece) {
        this.lastMoveInfo = {
          ...this.lastMoveInfo!,
          capturedType: targetPiece.type,
        };
      }
      delete this.state.pieces[targetCell.pieceId];
      if (targetPiece && targetPiece.type === PieceType.CommandHub) {
        this.setWinner(mover, 'hub-capture');
      }
    }

    // Update old cell
    const oldCell = this.getCell(piece.position);
    if (oldCell) oldCell.pieceId = undefined;

    // Update new position
    piece.position = to;
    targetCell.pieceId = piece.id;

    if (this.state.winner) return true;

    this.endPly(mover);
    return true;
  }

  /** Sector Integration win check (instant or Integration Hold), then pass turn. */
  private endPly(mover: PlayerColor): void {
    if (this.state.winner) return;
    this.state.plyCount = (this.state.plyCount ?? 0) + 1;
    // Late-game activation: before sectorActivationPly the sector clock is
    // disarmed entirely (no wins, no Integration Hold streak accrual).
    const armed =
      this.state.plyCount >= (this.rules.sectorActivationPly ?? 0);
    if (this.isHybrid() && armed) {
      const sectorWinner = this.resolveSectorIntegration(mover);
      if (sectorWinner) {
        this.setWinner(sectorWinner, 'sector-integration');
        return;
      }
    }
    this.finishTurn(mover);
  }

  /**
   * With sectorHoldPlies=0, the mover wins instantly on coverage (legacy).
   * With sectorHoldPlies=K>0, each side's coverage streak ticks every ply
   * (reset when coverage drops below the ratio); a side wins once its streak
   * reaches K, giving the opponent K−1 plies to break the net. Simultaneous
   * integration is unresolved at every hold setting, so turn parity cannot
   * decide a tied sector.
   */
  private resolveSectorIntegration(mover: PlayerColor): PlayerColor | null {
    const hold = this.rules.sectorHoldPlies ?? 0; // legacy rules objects
    const opponent =
      mover === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;
    if (hold <= 0) {
      const moverIntegrated = this.hasSectorIntegration(mover);
      const opponentIntegrated = this.hasSectorIntegration(opponent);
      if (moverIntegrated && opponentIntegrated) return null;
      if (moverIntegrated) return mover;
      if (opponentIntegrated) return opponent;
      return null;
    }

    const progress = this.state.sectorHoldProgress ?? {};
    for (const color of [PlayerColor.White, PlayerColor.Black]) {
      progress[color] = this.hasSectorIntegration(color)
        ? (progress[color] ?? 0) + 1
        : 0;
    }
    this.state.sectorHoldProgress = progress;

    const moverReady = (progress[mover] ?? 0) >= hold;
    const opponentReady = (progress[opponent] ?? 0) >= hold;

    // Both fleets may already satisfy coverage when a late clock activates.
    // Awarding that simultaneous state to the mover makes activation parity a
    // hidden color advantage (even activation plies favor Black, odd favor
    // White). A tied sector remains unresolved until one fleet breaks the
    // other's coverage; Surgical Strike remains available throughout.
    if (moverReady && opponentReady) return null;
    if (moverReady) return mover;
    if (opponentReady) return opponent;
    return null;
  }

  private finishTurn(mover: PlayerColor): void {
    if (this.state.winner) return;
    const nextPlayer =
      mover === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;

    if (!this.hasAvailableMoves(nextPlayer)) {
      this.setWinner(mover, 'no-moves');
    } else {
      this.state.currentPlayer = nextPlayer;
    }
  }

  private isValidWarpDestination(
    piece: Piece,
    to: Coordinate,
    nets: SensorNetContext,
  ): boolean {
    if (to.x === piece.position.x && to.y === piece.position.y) return false;
    if (!this.isValidCoordinate(to)) return false;
    const targetCell = this.getCell(to);
    if (!targetCell || targetCell.type === CellType.GravityWell) return false;
    if (targetCell.pieceId) {
      const targetPiece = this.getPiece(targetCell.pieceId);
      if (targetPiece?.owner === piece.owner) return false;
    }
    const enemy =
      piece.owner === PlayerColor.White
        ? PlayerColor.Black
        : PlayerColor.White;
    return !nets.byOwner[enemy].has(coordKey(to.x, to.y));
  }

  private setWinner(winner: PlayerColor, reason: WinnerReason): void {
    this.state.winner = winner;
    this.state.winnerReason = reason;
  }

  /** Eligible non-well cell count for sector integration. */
  public countControllableCells(): number {
    return this.state.cells.filter((c) => c.type !== CellType.GravityWell)
      .length;
  }

  /**
   * Fraction of controllable cells covered by owner's sensor net.
   * With Contested Space (contestedCellsNeutral), cells also covered by the
   * enemy net count for neither side.
   */
  public sectorControlRatio(owner: PlayerColor): number {
    const total = this.countControllableCells();
    if (total === 0) return 0;
    const net = this.getSensorNetSet(owner);
    const enemyNet = this.rules.contestedCellsNeutral
      ? this.getSensorNetSet(
          owner === PlayerColor.White ? PlayerColor.Black : PlayerColor.White,
        )
      : null;
    let covered = 0;
    for (const cell of this.state.cells) {
      if (cell.type === CellType.GravityWell) continue;
      const key = coordKey(cell.coordinate.x, cell.coordinate.y);
      if (!net.has(key)) continue;
      if (enemyNet?.has(key)) continue;
      covered += 1;
    }
    return covered / total;
  }

  public hasSectorIntegration(owner: PlayerColor): boolean {
    return (
      this.sectorControlRatio(owner) >= this.rules.sectorIntegrationRatio
    );
  }

  public isPieceDetected(piece: Piece): boolean {
    if (!this.isHybrid()) return false;
    const enemy =
      piece.owner === PlayerColor.White
        ? PlayerColor.Black
        : PlayerColor.White;
    return this.getSensorNetSet(enemy).has(
      coordKey(piece.position.x, piece.position.y),
    );
  }

  private isValidMove(
    piece: Piece,
    to: Coordinate,
    nets: SensorNetContext,
  ): boolean {
    if (this.isHybrid()) {
      return this.isValidHybridMove(piece, to, nets);
    }
    return this.isValidClassicMove(piece, to);
  }

  private isValidClassicMove(piece: Piece, to: Coordinate): boolean {
    const dx = Math.abs(piece.position.x - to.x);
    const dy = Math.abs(piece.position.y - to.y);

    switch (piece.type) {
      case PieceType.CommandHub:
        return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);

      case PieceType.Escort:
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

      case PieceType.Infiltrator:
        return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);

      case PieceType.Beam:
        return this.hasClearOrthogonalPath(piece.position, to);

      default:
        return false;
    }
  }

  private isValidHybridMove(
    piece: Piece,
    to: Coordinate,
    nets: SensorNetContext,
  ): boolean {
    const enemy =
      piece.owner === PlayerColor.White
        ? PlayerColor.Black
        : PlayerColor.White;
    const enemyNet = nets.byOwner[enemy];
    const ownNet = nets.byOwner[piece.owner];
    const detected = enemyNet.has(
      coordKey(piece.position.x, piece.position.y),
    );

    if (detected) {
      return this.isOneOrthogonalStep(piece.position, to);
    }

    switch (piece.type) {
      case PieceType.CommandHub:
        return this.isValidClassicMove(piece, to);

      case PieceType.Escort:
        return this.isOneOrthogonalStep(piece.position, to);

      case PieceType.Infiltrator: {
        if (this.usesInfiltratorSpool()) {
          if (piece.spoolTarget) {
            // Only the locked coordinate is listable; legality of landing is rechecked on execute.
            return (
              piece.spoolTarget.x === to.x && piece.spoolTarget.y === to.y
            );
          }
          return this.isValidWarpDestination(piece, to, nets);
        }
        if (to.x === piece.position.x && to.y === piece.position.y) {
          return false;
        }
        // Warp: any non-self square not in enemy sensor net
        return !enemyNet.has(coordKey(to.x, to.y));
      }

      case PieceType.Beam: {
        if (!this.hasClearOrthogonalPath(piece.position, to)) return false;
        return this.pathFullyInNet(piece.position, to, ownNet);
      }

      default:
        return false;
    }
  }

  private isOneOrthogonalStep(from: Coordinate, to: Coordinate): boolean {
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  private hasClearOrthogonalPath(from: Coordinate, to: Coordinate): boolean {
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);
    if (!((dx > 0 && dy === 0) || (dx === 0 && dy > 0))) return false;

    const stepX = dx === 0 ? 0 : (to.x - from.x) / dx;
    const stepY = dy === 0 ? 0 : (to.y - from.y) / dy;
    const distance = Math.max(dx, dy);

    for (let i = 1; i < distance; i++) {
      const checkX = from.x + stepX * i;
      const checkY = from.y + stepY * i;
      const cell = this.getCell({ x: checkX, y: checkY });
      if (!cell || cell.type === CellType.GravityWell || cell.pieceId) {
        return false;
      }
    }
    return true;
  }

  private pathFullyInNet(
    from: Coordinate,
    to: Coordinate,
    net: Set<string>,
  ): boolean {
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);
    const stepX = dx === 0 ? 0 : (to.x - from.x) / dx;
    const stepY = dy === 0 ? 0 : (to.y - from.y) / dy;
    const distance = Math.max(dx, dy);

    for (let i = 1; i <= distance; i++) {
      const x = from.x + stepX * i;
      const y = from.y + stepY * i;
      if (!net.has(coordKey(x, y))) return false;
    }
    return true;
  }

  /**
   * Calculates the sensor net (sovereign space) for a given player.
   * Hybrid uses hub + linked escorts; classic keeps the same projection
   * for UI/debug even though movement ignores it.
   */
  public calculateSensorNet(owner: PlayerColor): Coordinate[] {
    return Array.from(this.getSensorNetSet(owner)).map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x: x!, y: y! };
    });
  }

  public getSensorNetSet(owner: PlayerColor): Set<string> {
    return this.buildSensorNetForOwner(owner);
  }

  private buildSensorNetContext(): SensorNetContext {
    return {
      byOwner: {
        [PlayerColor.White]: this.buildSensorNetForOwner(PlayerColor.White),
        [PlayerColor.Black]: this.buildSensorNetForOwner(PlayerColor.Black),
      },
    };
  }

  private buildSensorNetForOwner(owner: PlayerColor): Set<string> {
    const pieces = Object.values(this.state.pieces).filter(
      (p) => p.owner === owner,
    );
    const sovereignSpaces: Set<string> = new Set();
    const commandHub = pieces.find((p) => p.type === PieceType.CommandHub);
    const hubR = this.rules.hubSensorRadius;
    const escortR = this.rules.escortSensorRadius;
    const linkDistance = this.rules.linkDistance;

    if (!commandHub) return sovereignSpaces;

    this.addRadius(sovereignSpaces, commandHub.position, hubR);

    const linkedIds = this.linkedFriendlyIds(commandHub, pieces, linkDistance);
    for (const p of pieces) {
      if (p.type === PieceType.Escort && linkedIds.has(p.id)) {
        this.addRadius(sovereignSpaces, p.position, escortR);
      }
    }

    return sovereignSpaces;
  }

  private linkedFriendlyIds(
    hub: Piece,
    friendly: Piece[],
    linkDistance: number,
  ): Set<string> {
    const byId = new Map(friendly.map((p) => [p.id, p]));
    const linked = new Set<string>([hub.id]);
    const queue = [hub.id];

    while (queue.length > 0) {
      const id = queue.pop()!;
      const current = byId.get(id);
      if (!current) continue;
      for (const other of friendly) {
        if (linked.has(other.id)) continue;
        if (chebyshev(current.position, other.position) <= linkDistance) {
          linked.add(other.id);
          queue.push(other.id);
        }
      }
    }
    return linked;
  }

  private addRadius(
    into: Set<string>,
    center: Coordinate,
    radius: number,
  ): void {
    for (
      let x = Math.max(0, center.x - radius);
      x <= Math.min(this.BOARD_SIZE - 1, center.x + radius);
      x++
    ) {
      for (
        let y = Math.max(0, center.y - radius);
        y <= Math.min(this.BOARD_SIZE - 1, center.y + radius);
        y++
      ) {
        into.add(coordKey(x, y));
      }
    }
  }
}

interface SensorNetContext {
  byOwner: Record<PlayerColor, Set<string>>;
}
