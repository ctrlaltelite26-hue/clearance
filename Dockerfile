# syntax=docker/dockerfile:1
#
# Container image for the Clearance backend services (Fastify API + agent worker).
#
# Both services ship in ONE image; choose which to run with the APP build arg:
#   docker build --build-arg APP=api    -t clearance-api    .
#   docker build --build-arg APP=worker -t clearance-worker .
#
# Why tsx and not a compiled dist?
#   The workspace packages (@clearance/*) are published as TypeScript SOURCE
#   (their package.json "main" points at ./src/index.ts), so `tsc` does not emit
#   them into each app's dist. Running the source directly with tsx — exactly
#   like `pnpm dev` — is the reliable runtime for this layout.

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Backend services never need a bundled Chromium (puppeteer is a root-only dev tool).
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS runtime
ARG APP=api
ENV NODE_ENV=production
ENV APP=${APP}
ENV PORT=3001

# 1) Manifests first so the dependency-install layer stays cached across code edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json                          apps/api/package.json
COPY apps/worker/package.json                       apps/worker/package.json
COPY apps/web/package.json                          apps/web/package.json
COPY mocks/package.json                             mocks/package.json
COPY packages/agent/package.json                    packages/agent/package.json
COPY packages/config/package.json                   packages/config/package.json
COPY packages/db/package.json                       packages/db/package.json
COPY packages/knowledge/package.json                packages/knowledge/package.json
COPY packages/policy/package.json                   packages/policy/package.json
COPY packages/integrations/agentmail/package.json   packages/integrations/agentmail/package.json

# Install only the API + worker dependency graph ("..." pulls in their workspace
# deps). This skips the web app (Next.js) and the root puppeteer dev tool.
# tsx is a devDependency of both services, so we must NOT pass --prod.
RUN pnpm install --frozen-lockfile --filter "@clearance/api..." --filter "@clearance/worker..."

# 2) Copy the source. node_modules is excluded via .dockerignore, so the cached
#    install layer above (including per-package node_modules symlinks) survives.
COPY . .

EXPOSE 3001

# Run the selected service from TypeScript source.
CMD ["sh", "-c", "exec pnpm --filter @clearance/${APP} exec tsx src/index.ts"]
