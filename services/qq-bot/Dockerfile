FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY services/qq-bot/package.json services/qq-bot/tsconfig.json ./services/qq-bot/
COPY services/qq-bot/src ./services/qq-bot/src
COPY packages/server-sdk/package.json packages/server-sdk/tsconfig.json ./packages/server-sdk/
COPY packages/server-sdk/src ./packages/server-sdk/src
COPY packages/server-shared/package.json packages/server-shared/tsconfig.json ./packages/server-shared/
COPY packages/server-shared/src ./packages/server-shared/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @proj-airi/qq-bot... build

FROM node:22-alpine AS production

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/qq-bot/package.json ./services/qq-bot/package.json
COPY packages/server-sdk/package.json ./packages/server-sdk/package.json
COPY packages/server-sdk/src ./packages/server-sdk/src
COPY packages/server-shared/package.json ./packages/server-shared/package.json
COPY packages/server-shared/src ./packages/server-shared/src
COPY --from=builder /app/services/qq-bot/dist ./services/qq-bot/dist

RUN pnpm install --frozen-lockfile --prod

CMD ["node", "services/qq-bot/dist/index.js"]
