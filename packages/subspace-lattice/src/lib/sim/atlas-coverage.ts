/**
 * Post-move Sensor Net / Contested Space snapshots for atlas:observe ply rows.
 * Scored coverage uses sectorControlRatio (excludes contested under Contested Space).
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';

export type NetCoverageSample = {
  /** Exclusive scored coverage (Contested Space). */
  covW: number;
  covB: number;
  /** Raw Sensor Net sizes (include contested cells). */
  netW: number;
  netB: number;
  /** |W ∩ B| contested cells. */
  cont: number;
  holdW: number;
  holdB: number;
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function sampleNetCoverage(
  engine: SubspaceLatticeEngine,
): NetCoverageSample {
  const w = engine.getSensorNetSet(PlayerColor.White);
  const b = engine.getSensorNetSet(PlayerColor.Black);
  let cont = 0;
  for (const key of w) {
    if (b.has(key)) cont += 1;
  }
  const hold = engine.getState().sectorHoldProgress;
  return {
    covW: round3(engine.sectorControlRatio(PlayerColor.White)),
    covB: round3(engine.sectorControlRatio(PlayerColor.Black)),
    netW: w.size,
    netB: b.size,
    cont,
    holdW: hold?.[PlayerColor.White] ?? 0,
    holdB: hold?.[PlayerColor.Black] ?? 0,
  };
}

/**
 * Contested-net stall: nets overlap materially while neither side has scored
 * Integration coverage (ρ). Raw nets can look large while exclusive cov stalls.
 */
export function isContestedNetStall(
  s: Pick<NetCoverageSample, 'covW' | 'covB' | 'cont' | 'netW' | 'netB'>,
  rho = 0.45,
): boolean {
  if (Math.max(s.covW, s.covB) >= rho) return false;
  const union = s.netW + s.netB - s.cont;
  if (union < 20) return false;
  return s.cont >= 8 && s.cont / union >= 0.2;
}

export type CoverageBandStats = {
  pliesWithCoverage: number;
  meanCovW: number;
  meanCovB: number;
  meanNetW: number;
  meanNetB: number;
  meanCont: number;
  stallRate: number;
  stallPlies: number;
};

export function aggregateCoverageStats(
  samples: Array<Partial<NetCoverageSample> | null | undefined>,
  rho = 0.45,
): CoverageBandStats | null {
  let n = 0;
  let covW = 0;
  let covB = 0;
  let netW = 0;
  let netB = 0;
  let cont = 0;
  let stall = 0;
  for (const s of samples) {
    if (
      s == null ||
      typeof s.covW !== 'number' ||
      typeof s.covB !== 'number' ||
      typeof s.netW !== 'number' ||
      typeof s.netB !== 'number' ||
      typeof s.cont !== 'number'
    ) {
      continue;
    }
    n += 1;
    covW += s.covW;
    covB += s.covB;
    netW += s.netW;
    netB += s.netB;
    cont += s.cont;
    if (isContestedNetStall(s as NetCoverageSample, rho)) stall += 1;
  }
  if (n === 0) return null;
  return {
    pliesWithCoverage: n,
    meanCovW: round3(covW / n),
    meanCovB: round3(covB / n),
    meanNetW: round3(netW / n),
    meanNetB: round3(netB / n),
    meanCont: round3(cont / n),
    stallRate: stall / n,
    stallPlies: stall,
  };
}
