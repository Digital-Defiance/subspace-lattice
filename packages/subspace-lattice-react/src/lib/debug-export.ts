import {
  buildLatticeDebugFilename,
  type LatticeDebugExport,
} from '@subspace-lattice/core';
import { deliverBlob, type DeliverFileResult } from './deliver-file';

export async function downloadDebugExport(
  payload: LatticeDebugExport,
  filename?: string,
): Promise<DeliverFileResult> {
  const name =
    filename ??
    buildLatticeDebugFilename(payload.sectorCode, payload.exportedAt);
  const json = JSON.stringify(payload, null, 2);
  return deliverBlob({
    blob: new Blob([json], { type: 'application/json' }),
    filename: name,
    title: `Subspace Lattice · Debug export (${payload.sectorCode})`,
    text: json,
  });
}

export type { DeliverFileResult };
