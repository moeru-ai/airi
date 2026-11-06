FROM node:24.22.1-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
# Manifests come first, so a source change does not install dependencies again.
COPY server/apps/auth/package.json server/apps/auth/package.json
COPY server/packages/auth-shared/package.json server/packages/auth-shared/package.json
COPY server/packages/http-error-shared/package.json server/packages/http-error-shared/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @proj-airi/auth-server...

COPY server/apps/auth server/apps/auth
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/http-error-shared server/packages/http-error-shared

RUN pnpm -F @proj-airi/auth-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/auth-server", "start"]
