/**
 * Firestore rules integration tests against the emulator.
 * Skipped automatically when FIRESTORE_EMULATOR_HOST is unset.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.runIf(run)('firestore.rules (emulator)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const hostPort = process.env.FIRESTORE_EMULATOR_HOST!;
    const [host, port] = hostPort.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-subspace',
      firestore: {
        host,
        port: Number(port),
        rules: readFileSync(
          resolve(__dirname, '../../../firestore.rules'),
          'utf8',
        ),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('allows members to read rooms and denies writes from clients', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'latticeRooms/room1'), {
        roomCode: 'ABC12',
        name: 'Test',
        creatorId: 'user-a',
        whitePlayerId: 'user-a',
        memberIds: ['user-a'],
        allowObservers: true,
        observerIds: [],
      });
    });

    const member = testEnv.authenticatedContext('user-a');
    const stranger = testEnv.authenticatedContext('user-b');

    await assertSucceeds(
      getDoc(doc(member.firestore(), 'latticeRooms/room1')),
    );
    await assertFails(
      getDoc(doc(stranger.firestore(), 'latticeRooms/room1')),
    );
    await assertFails(
      setDoc(doc(member.firestore(), 'latticeRooms/room1'), {
        name: 'hacked',
      }),
    );
  });

  it('allows members to read room subcollections; denies client writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'latticeRooms/room1'), {
        memberIds: ['user-a'],
      });
      await setDoc(doc(db, 'latticeRooms/room1/meta/gameState'), { ply: 1 });
      await setDoc(doc(db, 'latticeRooms/room1/chat/m1'), { text: 'hi' });
      await setDoc(doc(db, 'latticeRooms/room1/events/e1'), { type: 'move' });
    });

    const member = testEnv.authenticatedContext('user-a');
    const stranger = testEnv.authenticatedContext('user-b');

    await assertSucceeds(
      getDoc(doc(member.firestore(), 'latticeRooms/room1/meta/gameState')),
    );
    await assertSucceeds(
      getDoc(doc(member.firestore(), 'latticeRooms/room1/chat/m1')),
    );
    await assertFails(
      getDoc(doc(stranger.firestore(), 'latticeRooms/room1/chat/m1')),
    );
    await assertFails(
      setDoc(doc(member.firestore(), 'latticeRooms/room1/chat/m2'), {
        text: 'nope',
      }),
    );
  });

  it('allows signed-in clients to read latticeRoomCodes; denies writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'latticeRoomCodes/ABC12'), {
        roomId: 'room1',
      });
    });
    const user = testEnv.authenticatedContext('user-a');
    const anon = testEnv.unauthenticatedContext();

    await assertSucceeds(
      getDoc(doc(user.firestore(), 'latticeRoomCodes/ABC12')),
    );
    await assertFails(
      getDoc(doc(anon.firestore(), 'latticeRoomCodes/ABC12')),
    );
    await assertFails(
      setDoc(doc(user.firestore(), 'latticeRoomCodes/XYZ99'), {
        roomId: 'x',
      }),
    );
  });

  it('latticeTei is world-readable and client-immutable', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'latticeTei/user-a'), {
        displayName: 'Commander',
        localAi: { displayGrade: 'I15', matches: 3, wins: 2 },
      });
    });

    const anon = testEnv.unauthenticatedContext();
    const owner = testEnv.authenticatedContext('user-a');

    await assertSucceeds(getDoc(doc(anon.firestore(), 'latticeTei/user-a')));
    await assertFails(
      setDoc(doc(owner.firestore(), 'latticeTei/user-a'), {
        localAi: { displayGrade: 'E99', matches: 99 },
      }),
    );
  });

  it('latticeRatingEvents: owner read only; no client writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'latticeRatingEvents/evt1'), {
        uid: 'user-a',
        kind: 'local-ai',
        strength: 'normal',
        humanWon: true,
      });
    });

    const owner = testEnv.authenticatedContext('user-a');
    const other = testEnv.authenticatedContext('user-b');

    await assertSucceeds(
      getDoc(doc(owner.firestore(), 'latticeRatingEvents/evt1')),
    );
    await assertFails(
      getDoc(doc(other.firestore(), 'latticeRatingEvents/evt1')),
    );
    await assertFails(
      setDoc(doc(owner.firestore(), 'latticeRatingEvents/evt2'), {
        uid: 'user-a',
      }),
    );
  });

  it('presence: members write own coach signal; cannot write others', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'latticeRooms/room1'), {
        memberIds: ['user-a', 'user-b'],
      });
    });

    const a = testEnv.authenticatedContext('user-a');
    const b = testEnv.authenticatedContext('user-b');

    await assertSucceeds(
      setDoc(doc(a.firestore(), 'latticeRooms/room1/presence/user-a'), {
        coachRequestedAt: new Date().toISOString(),
        coachUsedThisMatch: true,
        plyCount: 2,
      }),
    );
    await assertFails(
      setDoc(doc(a.firestore(), 'latticeRooms/room1/presence/user-b'), {
        coachRequestedAt: new Date().toISOString(),
        coachUsedThisMatch: true,
      }),
    );
    await assertSucceeds(
      getDoc(doc(b.firestore(), 'latticeRooms/room1/presence/user-a')),
    );
  });
});
