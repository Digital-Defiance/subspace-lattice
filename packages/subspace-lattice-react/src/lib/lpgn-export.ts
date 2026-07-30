import {
  buildLpgnFilename,
  formatLpgnFromDebugExport,
  type LatticeDebugExport,
  type RulesConfig,
} from '@subspace-lattice/core';
import { deliverBlob, type DeliverFileResult } from './deliver-file';

export async function downloadLpgnExport(
  payload: LatticeDebugExport,
  rules: RulesConfig,
  filename?: string,
): Promise<DeliverFileResult> {
  const text = formatLpgnFromDebugExport(payload, rules);
  const name =
    filename ?? buildLpgnFilename(payload.sectorCode, payload.exportedAt);
  return deliverBlob({
    blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
    filename: name,
    title: `Subspace Lattice · ${payload.sectorCode}`,
    text,
  });
}
