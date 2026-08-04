FROM node:24-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY server/apps/auth server/apps/auth
COPY server/packages/auth-shared server/packages/auth-shared

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @proj-airi/auth-server...

RUN pnpm -F @proj-airi/auth-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/auth-server", "start"]
