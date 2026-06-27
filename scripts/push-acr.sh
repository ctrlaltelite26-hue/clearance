#!/usr/bin/env bash
# Push clearance-api and clearance-worker to Alibaba Container Registry (ACR).
#
# 1. Fill in the three values below (from ACR console → Instances → your registry).
# 2. Run: bash scripts/push-acr.sh
#
# ACR console: https://cr.console.aliyun.com/
#   - Region: e.g. ap-southeast-1 (Singapore) — can match OSS_REGION
#   - Namespace: create one e.g. "clearance"
#   - Login password: ACR → Access Credential → set a fixed password (not your Aliyun login)

set -euo pipefail

# --- EDIT THESE ---
ACR_REGION="ap-southeast-1"
ACR_NAMESPACE="clearance"
# Your Alibaba Cloud account name or the registry login username shown in ACR
ACR_USERNAME="your-aliyun-account"
# --- END EDIT ---

REG="registry.${ACR_REGION}.aliyuncs.com/${ACR_NAMESPACE}"

echo "Registry: ${REG}"
echo "Logging in to ACR (paste the fixed password from ACR → Access Credential)..."
docker login --username="${ACR_USERNAME}" "registry.${ACR_REGION}.aliyuncs.com"

echo "Tagging images..."
docker tag clearance-api:latest    "${REG}/clearance-api:latest"
docker tag clearance-worker:latest "${REG}/clearance-worker:latest"

echo "Pushing clearance-api..."
docker push "${REG}/clearance-api:latest"

echo "Pushing clearance-worker..."
docker push "${REG}/clearance-worker:latest"

echo ""
echo "Done. Use these image URIs in SAE / ECS:"
echo "  ${REG}/clearance-api:latest"
echo "  ${REG}/clearance-worker:latest"
