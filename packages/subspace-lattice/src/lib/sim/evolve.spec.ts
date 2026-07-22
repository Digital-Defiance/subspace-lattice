import { describe, expect, it } from 'vitest';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  generateRulesCandidates,
  parseFixedRulesSpec,
  resolveFixedRulesConfigs,
  rulesConfigId,
  sampleRulesConfig,
} from './param-space';
import { createSeededRng } from '../ai/rng';
import {
  DEFAULT_SCORECARD_THRESHOLDS,
  TRACK_A_THRESHOLDS,
  TRACK_B_THRESHOLDS,
  evaluateRulesConfig,
  scoreMatches,
  selectParetoFront,
} from './scorecard';
import { runEvolution, evolutionToJsonl } from './evolve';
import { MatchResult } from './match-runner';
import { PlayerColor } from '../interfaces';

describe('evolution / scorecard', () => {
  it('samples distinct hybrid rule configs', () => {
    const rng = createSeededRng(1);
    const a = sampleRulesConfig(rng);
    const b = sampleRulesConfig(rng);
    expect(a.version).toBe('hybrid');
    expect(a.boardSize).toBe(11);
    expect(rulesConfigId(a)).not.toEqual('');
    // Not always different, but generateCandidates should yield multiple
    const batch = generateRulesCandidates(4, 7);
    expect(batch.length).toBe(4);
    expect(new Set(batch.map(rulesConfigId)).size).toBe(4);
    expect(b.version).toBe('hybrid');
  });

  it('parseFixedRulesSpec accepts compact and keyed forms', () => {
    const a = parseFixedRulesSpec('hub3,esc1,link2,0.51');
    expect(a).toMatchObject({
      version: 'hybrid',
      hubSensorRadius: 3,
      escortSensorRadius: 1,
      linkDistance: 2,
      sectorIntegrationRatio: 0.51,
    });
    const b = parseFixedRulesSpec('hub=2,esc=1,link=2,sec=0.51');
    expect(b.hubSensorRadius).toBe(2);
    expect(b.sectorIntegrationRatio).toBe(0.51);
    const spool = parseFixedRulesSpec('hybrid-spool:hub3,esc1,link2,0.45');
    expect(spool.version).toBe('hybrid-spool');
    expect(spool.infiltratorSpoolUp).toBe(true);
    expect(spool.sectorHoldPlies).toBe(0); // hold defaults off
    const hold = parseFixedRulesSpec('hub3,esc1,link2,0.45,hold8');
    expect(hold.sectorHoldPlies).toBe(8);
    expect(rulesConfigId(hold)).toBe(
      'hybrid_hub3_esc1_link2_sec0.45_hold8',
    );
    const holdKeyed = parseFixedRulesSpec('hub=3,esc=1,link=2,sec=0.45,hold=4');
    expect(holdKeyed.sectorHoldPlies).toBe(4);
    expect(holdKeyed.contestedCellsNeutral).toBe(false); // neutral defaults off
    const neutral = parseFixedRulesSpec('hub3,esc1,link2,0.45,hold4,neutral');
    expect(neutral.contestedCellsNeutral).toBe(true);
    expect(rulesConfigId(neutral)).toBe(
      'hybrid_hub3_esc1_link2_sec0.45_hold4_neutral',
    );
    expect(
      parseFixedRulesSpec('hub3,esc1,link2,0.45,neutral=0').contestedCellsNeutral,
    ).toBe(false);
    expect(neutral.sectorActivationPly).toBe(0); // activation defaults off
    const act = parseFixedRulesSpec(
      'hub3,esc1,link2,0.45,hold1,neutral,activation100',
    );
    expect(act.sectorActivationPly).toBe(100);
    expect(rulesConfigId(act)).toBe(
      'hybrid_hub3_esc1_link2_sec0.45_hold1_neutral_act100',
    );
    expect(
      parseFixedRulesSpec('hub3,esc1,link2,0.45,act=80').sectorActivationPly,
    ).toBe(80);
    const relay = parseFixedRulesSpec(
      'hub3,esc1,link2,0.45,hold1,neutral,act80,relay1',
    );
    expect(relay.firstPlayerRelayCount).toBe(1);
    expect(rulesConfigId(relay)).toBe(
      'hybrid_hub3_esc1_link2_sec0.45_hold1_neutral_act80_relay1',
    );
    expect(
      parseFixedRulesSpec('hub3,esc1,link2,0.45,relay=0')
        .firstPlayerRelayCount,
    ).toBe(0);
    expect(
      parseFixedRulesSpec('hub3,esc1,link2,0.45,relay2')
        .firstPlayerRelayCount,
    ).toBe(2);
    const cells = resolveFixedRulesConfigs([
      'hub3,esc1,link2,0.51',
      'hub3,esc1,link2,0.51',
      'hub3,esc1,link2,0.6',
    ]);
    expect(cells.map(rulesConfigId)).toEqual([
      'hybrid_hub3_esc1_link2_sec0.51',
      'hybrid_hub3_esc1_link2_sec0.6',
    ]);
  });

  it('rejects configs with too many instant wins', () => {
    const rules = resolveRulesConfig('hybrid');
    const instant: MatchResult = {
      winner: PlayerColor.White,
      winnerReason: 'hub-capture',
      plies: 1,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    };
    const card = scoreMatches(
      'test',
      rules,
      [instant, instant, instant, instant],
      [],
    );
    expect(card.rejected).toBe(true);
    expect(card.rejectReasons.some((r) => r.includes('instant'))).toBe(true);
  });

  it('rejects a 25–75 color split and reports wins by path', () => {
    const rules = resolveRulesConfig('hybrid');
    const result = (
      winner: PlayerColor,
      winnerReason: 'hub-capture' | 'sector-integration',
    ): MatchResult => ({
      winner,
      winnerReason,
      plies: 40,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    const card = scoreMatches(
      'color-skew',
      rules,
      [
        result(PlayerColor.White, 'hub-capture'),
        result(PlayerColor.Black, 'hub-capture'),
        result(PlayerColor.Black, 'hub-capture'),
        result(PlayerColor.Black, 'sector-integration'),
      ],
      [],
      {
        ...DEFAULT_SCORECARD_THRESHOLDS,
        minSectorIntegrationRate: 0,
        requireClockSignature: false,
      },
    );

    expect(card.whiteWinRate).toBe(0.25);
    expect(card.fairness).toBe(0.5);
    expect(card.rejected).toBe(true);
    expect(card.rejectReasons).toContain('fairness 0.50 < 0.8');
    expect(card.winsByColorAndPath[PlayerColor.White]).toMatchObject({
      total: 1,
      hubCapture: 1,
      sectorIntegration: 0,
    });
    expect(card.winsByColorAndPath[PlayerColor.Black]).toMatchObject({
      total: 3,
      hubCapture: 2,
      sectorIntegration: 1,
    });
  });

  it('rejects early sector wins that fail the clock signature', () => {
    const rules = resolveRulesConfig('hybrid');
    const hub = (plies: number): MatchResult => ({
      winner: PlayerColor.White,
      winnerReason: 'hub-capture',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    const sector = (plies: number): MatchResult => ({
      winner: PlayerColor.Black,
      winnerReason: 'sector-integration',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    // ≥8 samples each so clock hard-rejects; sector earlier than hub
    const hubs = [40, 42, 44, 46, 48, 50, 52, 54].map(hub);
    const sectors = [12, 14, 16, 18, 20, 22, 24, 26].map(sector);
    const card = scoreMatches(
      'early-sector',
      rules,
      [...hubs, ...sectors],
      [],
      { ...DEFAULT_SCORECARD_THRESHOLDS, requireClockSignature: true },
    );
    expect(card.winPath.clockSignature).toBe(false);
    expect(card.rejected).toBe(true);
    expect(card.rejectReasons.some((r) => r.includes('clockSignature'))).toBe(
      true,
    );
  });

  it('down-ranks thin-sample early sector without hard-rejecting clock', () => {
    const rules = resolveRulesConfig('hybrid');
    const hub = (plies: number): MatchResult => ({
      winner: PlayerColor.White,
      winnerReason: 'hub-capture',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    const sector = (plies: number): MatchResult => ({
      winner: PlayerColor.Black,
      winnerReason: 'sector-integration',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    // Only 2 sector samples in equal-strength games — below minClockSamples=8.
    // The sector result in skillMatches must not contaminate win-path telemetry.
    const card = scoreMatches(
      'thin-early-sector',
      rules,
      [hub(40), hub(42), hub(44), hub(46), sector(12), sector(14)],
      [hub(38), hub(48), hub(50), sector(10)],
      {
        ...DEFAULT_SCORECARD_THRESHOLDS,
        minSkillDiscrimination: 0,
        minFairness: 0,
        minSectorIntegrationRate: 0,
      },
    );
    expect(card.winPath.clockSignature).toBeNull();
    expect(card.winPath.sectorSampleCount).toBe(2);
    expect(card.rejectReasons.some((r) => r.includes('clockSignature'))).toBe(
      false,
    );
    expect(card.rejected).toBe(false);
    expect(card.composite).toBeGreaterThan(0);
  });

  it('accepts clock signature when sector medians exceed hub', () => {
    const rules = resolveRulesConfig('hybrid');
    const hub = (plies: number): MatchResult => ({
      winner: PlayerColor.White,
      winnerReason: 'hub-capture',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    const sector = (plies: number): MatchResult => ({
      winner: PlayerColor.Black,
      winnerReason: 'sector-integration',
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    const hubs = [18, 20, 22, 24, 26, 28, 30, 32].map(hub);
    const sectors = [48, 50, 52, 55, 58, 60, 62, 70].map(sector);
    const card = scoreMatches(
      'clock-ok',
      rules,
      [...hubs, ...sectors],
      [],
      {
        ...DEFAULT_SCORECARD_THRESHOLDS,
        minSkillDiscrimination: 0,
        minFairness: 0,
      },
    );
    expect(card.winPath.clockSignature).toBe(true);
    expect(card.winPath.sectorIntegrationRate).toBe(0.5);
    expect(card.rejected).toBe(false);
  });

  it('selectParetoFront drops dominated cards', () => {
    const rules = resolveRulesConfig('hybrid');
    const winPath = {
      hubCaptureRate: 0.65,
      sectorIntegrationRate: 0.3,
      noMovesRate: 0.05,
      decidedGames: 10,
      hubSampleCount: 7,
      sectorSampleCount: 3,
      medianHubPlies: 25,
      medianSectorPlies: 55,
      clockSignature: true as boolean | null,
    };
    const emptyWinsByColorAndPath = {
      WHITE: { hubCapture: 0, sectorIntegration: 0, noMoves: 0, total: 0 },
      BLACK: { hubCapture: 0, sectorIntegration: 0, noMoves: 0, total: 0 },
    };
    const base = {
      rules,
      track: 'A' as const,
      games: 10,
      decisiveRate: 0.9,
      whiteWinRate: 0.5,
      fairness: 0.9,
      winsByColorAndPath: emptyWinsByColorAndPath,
      skillDiscrimination: 0.9,
      skillCalibration: 0.9,
      skillSeparation: 4,
      skillMeanSigma: 4,
      avgPlies: 20,
      interestingMidgame: 0.8,
      instantWinRate: 0.05,
      deadlockRate: 0.1,
      winPath,
      infiltratorCapturesPerGame: 0,
      spoolAnnouncesPerGame: 0,
      spoolFailuresPerGame: 0,
      capturesByMoverType: {},
      rejected: false,
      rejectReasons: [] as string[],
      composite: 0.8,
    };
    const a = {
      ...base,
      configId: 'a',
      fairness: 0.9,
      skillDiscrimination: 0.9,
      skillCalibration: 0.9,
      skillSeparation: 4,
    };
    const b = {
      ...base,
      configId: 'b',
      fairness: 0.5,
      skillDiscrimination: 0.5,
      skillCalibration: 0.5,
      skillSeparation: 1,
      interestingMidgame: 0.5,
      decisiveRate: 0.5,
      composite: 0.4,
    };
    const front = selectParetoFront([a, b]);
    expect(front.map((c) => c.configId)).toEqual(['a']);
  });

  it('evaluateRulesConfig returns a scorecard for default hybrid', () => {
    const card = evaluateRulesConfig({
      rules: resolveRulesConfig('hybrid'),
      seed: 3,
      fairnessGames: 2,
      skillGames: 2,
      maxPlies: 60,
      fairnessMctsSims: 0,
      useSkillLadder: false,
    });
    expect(card.games).toBe(4);
    expect(card.configId).toContain('hybrid');
    expect(card.track).toBe('A');
  });

  it('Track B accepts high sector rates that Track A rejects', () => {
    const rules = resolveRulesConfig('hybrid');
    const mk = (
      reason: 'hub-capture' | 'sector-integration',
      plies: number,
      winner: PlayerColor,
    ): MatchResult => ({
      winner,
      winnerReason: reason,
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    // ~90% sector, roughly color-balanced so fairness stays healthy.
    const fairness = [
      mk('hub-capture', 40, PlayerColor.White),
      mk('sector-integration', 50, PlayerColor.White),
      mk('sector-integration', 52, PlayerColor.Black),
      mk('sector-integration', 54, PlayerColor.White),
      mk('sector-integration', 56, PlayerColor.Black),
      mk('sector-integration', 58, PlayerColor.White),
      mk('sector-integration', 60, PlayerColor.Black),
      mk('sector-integration', 62, PlayerColor.White),
      mk('sector-integration', 64, PlayerColor.Black),
      mk('sector-integration', 66, PlayerColor.White),
    ];
    const trackA = scoreMatches(
      'hyper',
      rules,
      fairness,
      [],
      TRACK_A_THRESHOLDS,
      { track: 'A' },
    );
    const trackB = scoreMatches(
      'hyper',
      rules,
      fairness,
      [],
      TRACK_B_THRESHOLDS,
      { track: 'B' },
    );
    expect(trackA.winPath.sectorIntegrationRate).toBeGreaterThan(0.85);
    expect(trackA.rejected).toBe(true);
    expect(trackA.rejectReasons.some((r) => r.includes('hyper-territorial'))).toBe(
      true,
    );
    expect(trackB.rejected).toBe(false);
    expect(trackB.track).toBe('B');
  });

  it('Track A hard-gates sector share to 15–45% of decided games', () => {
    const rules = resolveRulesConfig('hybrid');
    const mk = (
      reason: 'hub-capture' | 'sector-integration',
      plies: number,
      winner: PlayerColor,
    ): MatchResult => ({
      winner,
      winnerReason: reason,
      plies,
      truncated: false,
      replay: [],
      rulesVersion: 'hybrid',
      capturesByMoverType: {},
      infiltratorCaptures: 0,
      spoolAnnounces: 0,
      spoolFailures: 0,
    });
    // 50% sector (sector later than hub so the clock gate stays out of it;
    // n=6 per path is below minClockSamples so clockSignature is null).
    const even = [
      mk('hub-capture', 40, PlayerColor.White),
      mk('hub-capture', 42, PlayerColor.Black),
      mk('hub-capture', 44, PlayerColor.White),
      mk('hub-capture', 46, PlayerColor.Black),
      mk('hub-capture', 48, PlayerColor.White),
      mk('hub-capture', 50, PlayerColor.Black),
      mk('sector-integration', 80, PlayerColor.White),
      mk('sector-integration', 82, PlayerColor.Black),
      mk('sector-integration', 84, PlayerColor.White),
      mk('sector-integration', 86, PlayerColor.Black),
      mk('sector-integration', 88, PlayerColor.White),
      mk('sector-integration', 90, PlayerColor.Black),
    ];
    const fifty = scoreMatches('fifty', rules, even, [], TRACK_A_THRESHOLDS, {
      track: 'A',
    });
    expect(fifty.rejected).toBe(true);
    expect(
      fifty.rejectReasons.some((r) => r.includes('hyper-territorial')),
    ).toBe(true);

    // ~8% sector rejects as cosmetic under Track A's 15% floor.
    const sparse = [
      ...[40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60].map((p, i) =>
        mk('hub-capture', p, i % 2 ? PlayerColor.Black : PlayerColor.White),
      ),
      mk('sector-integration', 90, PlayerColor.Black),
    ];
    const cosmetic = scoreMatches(
      'cosmetic',
      rules,
      sparse,
      [],
      TRACK_A_THRESHOLDS,
      { track: 'A' },
    );
    expect(cosmetic.rejected).toBe(true);
    expect(cosmetic.rejectReasons.some((r) => r.includes('cosmetic net'))).toBe(
      true,
    );
  });

  it('fixed-cell runs use paired seeds (common random numbers)', () => {
    const rules = resolveRulesConfig('hybrid');
    const result = runEvolution({
      seed: 5,
      fixedRules: [rules, { ...rules }],
      fairnessGames: 2,
      skillGames: 0,
      aiTrials: 0,
      maxPlies: 40,
      fairnessMctsSims: 0,
    });
    // Identical rules + paired seeds ⇒ identical scorecards (only configId-
    // independent fields could differ, and they don't).
    expect(result.scorecards[0]).toEqual(result.scorecards[1]);
  });

  it('counterfactual mode evaluates sector-disabled twins with paired seeds', () => {
    const rules = resolveRulesConfig('hybrid');
    const result = runEvolution({
      seed: 7,
      fixedRules: [rules],
      fairnessGames: 2,
      skillGames: 0,
      aiTrials: 0,
      maxPlies: 40,
      fairnessMctsSims: 0,
      counterfactualClock: true,
    });
    expect(result.counterfactuals).toHaveLength(1);
    const twin = result.counterfactuals![0]!;
    expect(twin.configId).toContain('sec1.01');
    expect(twin.rules.sectorIntegrationRatio).toBe(1.01);
    const jsonl = evolutionToJsonl(result);
    expect(jsonl).toContain('counterfactual-scorecard');
    expect(jsonl).toContain('clockFunctional');
  });

  it('runEvolution sets humanGateRequired and emits jsonl', () => {
    const result = runEvolution({
      seed: 2,
      candidates: 2,
      fairnessGames: 2,
      skillGames: 2,
      aiTrials: 0,
      maxPlies: 40,
      fairnessMctsSims: 0,
    });
    expect(result.humanGateRequired).toBe(true);
    expect(result.track).toBe('A');
    expect(result.scorecards.length).toBe(2);
    const jsonl = evolutionToJsonl(result);
    expect(jsonl.split('\n').filter(Boolean).length).toBeGreaterThan(2);
    expect(jsonl).toContain('humanGateRequired');
    expect(jsonl).toContain('"track":"A"');
  }, 30_000);
});
