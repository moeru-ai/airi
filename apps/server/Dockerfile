# Stage 1: build ui-server-auth from source so the HTML's Vite `base` and
# the server's route prefix are guaranteed to come from the SAME commit.
# Pulling a prebuilt `ghcr.io/moeru-ai/airi/ui-server-auth:latest` image
# previously let the two drift (server route changed to `/auth/`, prebuilt
# HTML still at `/_ui/server-auth/` → every asset 404 in prod).
FROM node:24-alpine AS ui-build

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm -F @proj-airi/ui-server-auth run build

# Stage 2: server runtime. Vite emits the UI dist into
# /app/apps/server/public/ui-server-auth via its `outDir`, so we COPY from
# that exact path in the builder. Server install can stay --ignore-scripts
# since the UI is already built and the server has no native deps that
# need postinstall.
FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY apps/server apps/server
COPY packages/server-schema packages/server-schema
COPY packages/server-sdk-shared packages/server-sdk-shared
COPY --from=ui-build /app/apps/server/public/ui-server-auth apps/server/public/ui-server-auth

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @proj-airi/server-schema run build
RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server run build

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
