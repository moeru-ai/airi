FROM node:24.22.1-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

ENV pnpm_config_store_dir=/root/.pnpm-store

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
# Manifests come first, so a source change does not install dependencies again.
COPY server/apps/api/package.json server/apps/api/package.json
COPY server/packages/auth-shared/package.json server/packages/auth-shared/package.json
COPY server/packages/http-error-shared/package.json server/packages/http-error-shared/package.json
COPY server/packages/semconv-genai/package.json server/packages/semconv-genai/package.json
COPY server/packages/server-sdk-shared/package.json server/packages/server-sdk-shared/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY server/apps/api server/apps/api
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/http-error-shared server/packages/http-error-shared
COPY server/packages/semconv-genai server/packages/semconv-genai
COPY server/packages/server-sdk-shared server/packages/server-sdk-shared

RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/api-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
