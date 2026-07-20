#!/usr/bin/env bash
# Deploy Subspace Lattice to the shared warp-12 Firebase project without
# touching Warp hosting targets (bridge / leaderboard / ops).
#
# Org policy blocks allUsers invoker bindings. Functions use invoker: 'private'
# (apps/functions/src/index.ts). After a functions deploy we always run
# ensure-functions-public-invoker.sh (--no-invoker-iam-check) so callables remain
# reachable from the browser — same pattern as Warp.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${FIREBASE_PROJECT:-warp-12}"
ONLY="${1:-hosting:lattice,functions:lattice}"

echo "deploy:firebase — project=${PROJECT} only=${ONLY}"
echo "  Hosting target 'lattice' → site subspacelattice (lattice.iwgf.org / subspacelattice.web.app)"
echo "  Functions codebase 'lattice' (does not replace Warp codebase 'default')"
echo "  Firestore rules: NOT deployed by default (shared with Warp)."
echo "    Merge lattice* matches into Warp12/firestore.rules, then deploy from Warp."
echo

if [[ "${ONLY}" == *firestore* ]]; then
  echo "ERROR: refusing to deploy firestore from this repo — that would wipe Warp rules."
  echo "Merge lattice collections into Warp12/firestore.rules and deploy from Warp."
  exit 1
fi

if [[ "${ONLY}" == *hosting* ]] && ! yarn firebase target:apply hosting lattice subspacelattice --project "${PROJECT}" 2>/dev/null; then
  echo "Note: bind the target once if needed:"
  echo "  yarn firebase target:apply hosting lattice subspacelattice --project ${PROJECT}"
fi

set +e
yarn firebase deploy --project "${PROJECT}" --only "${ONLY}"
DEPLOY_EXIT=$?
set -e

if [[ "${ONLY}" == *functions* ]]; then
  if [ "$DEPLOY_EXIT" -ne 0 ]; then
    echo "" >&2
    echo "Firebase deploy exited ${DEPLOY_EXIT}." >&2
    echo "If the only failure was 'Failed to set invoker' / allUsers IAM, that is expected" >&2
    echo "under domain-restricted sharing — continuing with the Cloud Run invoker workaround." >&2
    echo "" >&2
  fi
  /usr/bin/env bash "$ROOT/scripts/ensure-functions-public-invoker.sh"
fi

if [ "$DEPLOY_EXIT" -ne 0 ]; then
  exit "$DEPLOY_EXIT"
fi

echo "Deploy completed."
