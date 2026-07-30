import { describe, expect, it } from 'vitest';
import {
  PlayerColor,
  resolveRulesConfig,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import {
  applyAuthoritativeAction,
  applyAuthoritativeMove,
  applyResign,
  canSendChat,
  generateRoomCode,
  isMember,
  isSeatedPlayer,
  MAX_OBSERVERS,
  planJoinRoom,
  planOnlineTeiReport,
  type RoomData,
} from './room-logic';

function baseRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    roomCode: 'ABC12',
    name: 'Test',
    creatorId: 'white-1',
    whitePlayerId: 'white-1',
    blackPlayerId: null,
    observerIds: [],
    allowObservers: true,
    memberIds: ['white-1'],
    ...overrides,
  };
}

describe('room-logic', () => {
  it('generateRoomCode returns 5 alphanumerics', () => {
    const code = generateRoomCode(() => 0);
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
  });

  it('isMember recognizes seats and observers', () => {
    const room = baseRoom({
      blackPlayerId: 'black-1',
      observerIds: ['obs-1'],
      memberIds: ['white-1', 'black-1', 'obs-1'],
    });
    expect(isMember(room, 'white-1')).toBe(true);
    expect(isMember(room, 'black-1')).toBe(true);
    expect(isMember(room, 'obs-1')).toBe(true);
    expect(isMember(room, 'stranger')).toBe(false);
  });

  it('planJoinRoom stores optional displayName on the open seat', () => {
    const room = baseRoom({
      whitePlayerId: null,
      creatorId: 'host',
      memberIds: ['host'],
      blackPlayerId: 'host',
    });
    const join = planJoinRoom(room, 'white-1', { displayName: 'Sulu' });
    expect(join.ok).toBe(true);
    if (!join.ok || join.alreadyMember) throw new Error('expected seat');
    expect(join.patch.whitePlayerId).toBe('white-1');
    expect(join.patch.whiteDisplayName).toBe('Sulu');
    expect(join.systemMessage).toContain('Sulu');
  });

  it('planJoinRoom seats white when host already claimed black', () => {
    const room = baseRoom({
      whitePlayerId: null,
      blackPlayerId: 'black-1',
      creatorId: 'black-1',
      memberIds: ['black-1'],
    });
    const join = planJoinRoom(room, 'white-1');
    expect(join.ok).toBe(true);
    if (join.ok && !join.alreadyMember) {
      expect(join.patch.whitePlayerId).toBe('white-1');
    }
  });

  it('planJoinRoom seats black and rejects a third player', () => {
    const room = baseRoom();
    const join = planJoinRoom(room, 'black-1');
    expect(join.ok).toBe(true);
    if (join.ok && !join.alreadyMember) {
      expect(join.patch.blackPlayerId).toBe('black-1');
    }

    const full = planJoinRoom(
      baseRoom({ blackPlayerId: 'black-1', memberIds: ['white-1', 'black-1'] }),
      'third',
    );
    expect(full).toEqual({ ok: false, reason: 'full' });
  });

  it('planJoinRoom enforces password and observer flag', () => {
    expect(
      planJoinRoom(baseRoom({ password: 'secret' }), 'black-1', {
        password: 'nope',
      }),
    ).toEqual({ ok: false, reason: 'password' });

    expect(
      planJoinRoom(baseRoom({ allowObservers: false }), 'obs', {
        asObserver: true,
      }),
    ).toEqual({ ok: false, reason: 'observers-disabled' });
  });

  it('caps spectator gallery and treats chat as seated-only', () => {
    const gallery = Array.from({ length: MAX_OBSERVERS }, (_, i) => `obs-${i}`);
    expect(
      planJoinRoom(baseRoom({ observerIds: gallery }), 'extra', {
        asObserver: true,
      }),
    ).toEqual({ ok: false, reason: 'gallery-full' });

    const room = baseRoom({
      blackPlayerId: 'black-1',
      observerIds: ['obs-1'],
    });
    expect(isSeatedPlayer(room, 'white-1')).toBe(true);
    expect(isSeatedPlayer(room, 'obs-1')).toBe(false);
    expect(canSendChat(room, 'white-1')).toBe(true);
    expect(canSendChat(room, 'obs-1')).toBe(false);
  });

  it('planOnlineTeiReport gates casual, assisted, incomplete, and seats', () => {
    expect(
      planOnlineTeiReport(baseRoom({ rated: false }), 'WHITE'),
    ).toEqual({ ok: false, reason: 'casual' });
    expect(
      planOnlineTeiReport(
        baseRoom({
          rated: true,
          assisted: true,
          blackPlayerId: 'black-1',
        }),
        'WHITE',
      ),
    ).toEqual({ ok: false, reason: 'assisted' });
    expect(
      planOnlineTeiReport(
        baseRoom({ rated: true, blackPlayerId: 'black-1' }),
        null,
      ),
    ).toEqual({ ok: false, reason: 'incomplete' });
    expect(
      planOnlineTeiReport(baseRoom({ rated: true }), 'WHITE'),
    ).toEqual({ ok: false, reason: 'missing-seats' });
    expect(
      planOnlineTeiReport(
        baseRoom({ rated: true, blackPlayerId: 'black-1' }),
        'BLACK',
      ),
    ).toEqual({
      ok: true,
      whitePlayerId: 'white-1',
      blackPlayerId: 'black-1',
      winner: 'BLACK',
    });
  });

  it('applyAuthoritativeMove validates turn and legality', () => {
    const room = baseRoom({
      blackPlayerId: 'black-1',
      memberIds: ['white-1', 'black-1'],
    });
    const state = new SubspaceLatticeEngine().getState();
    const whiteMove = new SubspaceLatticeEngine()
      .listLegalMoves(PlayerColor.White)[0]!;

    expect(
      applyAuthoritativeMove(state, 'black-1', room, whiteMove.pieceId, whiteMove.to)
        .ok,
    ).toBe(false);

    const applied = applyAuthoritativeMove(
      state,
      'white-1',
      room,
      whiteMove.pieceId,
      whiteMove.to,
    );
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.next.currentPlayer).toBe(PlayerColor.Black);
    }

    expect(
      applyAuthoritativeMove(state, 'white-1', room, 'w-e3', { x: 0, y: 0 }).ok,
    ).toBe(false);
  });

  it('applyAuthoritativeAction rejects moves before an opponent seats', () => {
    const room = baseRoom();
    const state = new SubspaceLatticeEngine().getState();
    const piece = state.pieces.find(
      (p) => p.player === PlayerColor.White && p.type !== 'COMMAND_HUB',
    );
    expect(piece).toBeDefined();
    const result = applyAuthoritativeAction(state, 'white-1', room, {
      type: 'move',
      pieceId: piece!.id,
      to: { x: piece!.position.x, y: piece!.position.y + 1 },
    });
    expect(result).toEqual({ ok: false, reason: 'no-opponent' });
  });

  it('applyAuthoritativeAction fires EMP when charged', () => {
    const room = baseRoom({
      blackPlayerId: 'black-1',
      memberIds: ['white-1', 'black-1'],
    });
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 1,
      empChargeTarget: 1,
      sectorActivationPly: 10_000,
      firstPlayerRelayCount: 0,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getStateCopy();
    state.empCharge = {
      [PlayerColor.White]: 1,
      [PlayerColor.Black]: 0,
    };
    state.currentPlayer = PlayerColor.White;

    const fired = applyAuthoritativeAction(state, 'white-1', room, {
      type: 'emp',
    });
    expect(fired.ok).toBe(true);
    if (fired.ok) {
      expect(fired.next.empActive?.firedBy).toBe(PlayerColor.White);
      expect(fired.next.empActive?.targetSide).toBe(PlayerColor.Black);
      expect(fired.next.empCharge?.[PlayerColor.White]).toBe(0);
    }
  });

  it('applyResign awards the opponent and rejects invalid cases', () => {
    const room = baseRoom({
      blackPlayerId: 'black-1',
      memberIds: ['white-1', 'black-1'],
    });
    const state = new SubspaceLatticeEngine().getState();

    const resigned = applyResign(state, 'white-1', room);
    expect(resigned.ok).toBe(true);
    if (resigned.ok) {
      expect(resigned.winner).toBe(PlayerColor.Black);
      expect(resigned.resigned).toBe(PlayerColor.White);
      expect(resigned.next.winner).toBe(PlayerColor.Black);
      expect(resigned.next.winnerReason).toBe('resign');
    }

    expect(applyResign(state, 'spectator', room)).toEqual({
      ok: false,
      reason: 'not-player',
    });
    expect(applyResign(state, 'white-1', baseRoom())).toEqual({
      ok: false,
      reason: 'no-opponent',
    });
    expect(
      applyResign(
        { ...state, winner: PlayerColor.White, winnerReason: 'hub-capture' },
        'black-1',
        room,
      ),
    ).toEqual({ ok: false, reason: 'already-finished' });
  });
});
