#!/usr/bin/env bash
# Run ON the Simple Application Server (as root) — installs Docker + swap.
# Usage (from your laptop after SSH):
#   curl -fsSL https://raw.githubusercontent.com/.../setup-sas-server.sh | bash
# Or paste this file after: ssh root@47.236.111.114

set -euo pipefail

echo "==> Updating packages..."
apt-get update -qq

echo "==> Installing Docker..."
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "==> Adding 1G swap (helps on 1 GiB RAM instances)..."
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Creating /opt/clearance..."
mkdir -p /opt/clearance

docker --version
docker compose version
echo ""
echo "Done. Next: upload images + .env + docker-compose.yml to /opt/clearance"
