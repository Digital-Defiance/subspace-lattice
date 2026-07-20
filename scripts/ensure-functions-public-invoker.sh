#!/usr/bin/env bash
# Org policies often block allUsers on Cloud Run (shared warp-12 project).
# Disable the invoker IAM check so browser + Hosting can reach Gen2 callables.
# Mirrors Warp12/scripts/ensure-functions-public-invoker.sh.
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-warp-12}"
REGION="${FUNCTIONS_REGION:-us-central1}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud not found — install google-cloud-sdk or add it to PATH" >&2
  exit 1
fi

SERVICES="$(
  gcloud run services list \
    --project="$PROJECT" \
    --region="$REGION" \
    --format='value(metadata.name)' \
    --filter='metadata.labels."goog-managed-by"=cloudfunctions'
)"

if [ -z "$SERVICES" ]; then
  echo "No Cloud Run services found for Cloud Functions in $PROJECT/$REGION" >&2
  exit 1
fi

COUNT=0
while IFS= read -r svc; do
  [ -z "$svc" ] && continue
  echo "Disabling invoker IAM check on $svc..."
  gcloud run services update "$svc" \
    --project="$PROJECT" \
    --region="$REGION" \
    --no-invoker-iam-check \
    --quiet >/dev/null
  COUNT=$((COUNT + 1))
done <<EOF
$SERVICES
EOF

echo "Invoker IAM check disabled on ${COUNT} function(s)."
