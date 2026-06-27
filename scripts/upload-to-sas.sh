#!/usr/bin/env bash
# Run on YOUR LAPTOP from the clearance/ repo root.
# Uploads Docker images + docker-compose to the Simple Application Server.
#
# Usage:
#   export SAS_HOST=47.236.111.114
#   export SAS_USER=root
#   bash scripts/upload-to-sas.sh

set -euo pipefail

SAS_HOST="${SAS_HOST:-47.236.111.114}"
SAS_USER="${SAS_USER:-root}"
REMOTE_DIR="/opt/clearance"
TARBALL="clearance-backend.tar.gz"

cd "$(dirname "$0")/.."

echo "==> Checking local images..."
docker image inspect clearance-api:latest >/dev/null
docker image inspect clearance-worker:latest >/dev/null

echo "==> Saving images to ${TARBALL} (may take 1–2 min)..."
docker save clearance-api:latest clearance-worker:latest | gzip > "${TARBALL}"

echo "==> Uploading to ${SAS_USER}@${SAS_HOST} (enter server password when prompted)..."
ssh "${SAS_USER}@${SAS_HOST}" "mkdir -p ${REMOTE_DIR}"
scp "${TARBALL}" docker-compose.prod.yml "${SAS_USER}@${SAS_HOST}:${REMOTE_DIR}/"

echo "==> Loading images on server..."
ssh "${SAS_USER}@${SAS_HOST}" "cd ${REMOTE_DIR} && gunzip -c ${TARBALL} | docker load && mv docker-compose.prod.yml docker-compose.yml"

echo ""
echo "Upload complete."
echo ""
echo "NEXT STEPS (on server):"
echo "  1. ssh ${SAS_USER}@${SAS_HOST}"
echo "  2. Create ${REMOTE_DIR}/.env (copy from your local .env + .env.local, add ALLOW_NO_AUTH=true)"
echo "  3. cd ${REMOTE_DIR} && docker compose up -d"
echo "  4. curl http://${SAS_HOST}:3001/health"
