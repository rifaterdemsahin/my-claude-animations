#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-bundle.sh — rebuild + redeploy the Remotion bundle to Azure static web.
#
# Idempotent. The serve URL never changes; only the files under $web change.
# Reads the storage account + key from Azure (logged-in az cli) so NO secret is
# baked into this script or the repo.
#
# Usage:
#   cd 5_Symbols/course_src/module-remotion-animations
#   ./deploy-bundle.sh
#
# Result: https://dpremotionbundle.z33.web.core.windows.net/ serves the new bundle.
# See 4_Formula/tools/remotion_azure_bundle_deploy.md for the full recipe.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ACCOUNT="${REMOTION_STORAGE_ACCOUNT:-dpremotionbundle}"
RG="${REMOTION_STORAGE_RG:-deliverypilot-rg}"
CONTAINER='$web'   # Azure static-website container (literal name)
SERVE_URL="https://${ACCOUNT}.z33.web.core.windows.net/"

cd "$(dirname "$0")"

echo "▶️  Building Remotion bundle (npm install + npx remotion bundle)…"
[ -d node_modules ] || npm install --no-audit --no-fund
npx remotion bundle src/index.ts --out-dir=out

echo "▶️  Fetching storage key from Azure (not stored anywhere)…"
KEY=$(az storage account keys list --account-name "$ACCOUNT" --query "[0].value" -o tsv)

echo "▶️  Uploading bundle → $ACCOUNT/$CONTAINER  (root-level)…"
az storage blob upload-batch \
  --account-name "$ACCOUNT" \
  --account-key "$KEY" \
  --source ./out \
  --destination "$CONTAINER" \
  --overwrite \
  --no-progress

echo "▶️  Verifying serve URL…"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVE_URL")
if [ "$CODE" = "200" ]; then
  echo "✅  Bundle live at: $SERVE_URL"
else
  echo "❌  Verification failed — GET / returned HTTP $CODE"
  exit 1
fi
