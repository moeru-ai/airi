FROM node:24-alpine

WORKDIR /app

RUN corepack enable


COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY apps/server apps/server
COPY --from=ghcr.io/moeru-ai/airi/ui-server-auth:latest /app/airi/projects/ui/ui-server-auth apps/server/public/ui-server-auth
COPY packages/server-schema packages/server-schema
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @proj-airi/server-schema run build
RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server run build

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
