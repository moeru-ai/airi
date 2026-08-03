FROM node:24-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY server/apps/api server/apps/api
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/drizzle-migration server/packages/drizzle-migration
COPY server/packages/node-shared server/packages/node-shared
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

# NOTICE:
# Force a fresh build of drizzle-migration and assert that
# unplugin-drizzle-orm-migrations actually replaced the `virtual:drizzle-migrations.sql`
# import. Without this guard a layer built when the rolldown plugin silently
# no-op'd (intermittently observed on Railway with tsdown 0.21.9 + rolldown
# 1.0.0-rc.16) ships a dist/index.mjs that re-exports the literal `virtual:`
# specifier, which crashes at runtime under tsx with
# ERR_UNSUPPORTED_ESM_URL_SCHEME. `rm -rf dist` keeps this RUN's command-string
# distinct from earlier cached variants and prevents a stale dist from masking
# a failed transform.
RUN rm -rf server/packages/drizzle-migration/dist \
 && pnpm -F @proj-airi/drizzle-migration run build \
 && if grep -qE "from ['\"]virtual:" server/packages/drizzle-migration/dist/index.mjs; then \
      echo "ERROR: drizzle-migration dist/index.mjs still references a virtual: specifier — unplugin-drizzle-orm-migrations transform did not run." >&2; \
      cat server/packages/drizzle-migration/dist/index.mjs >&2; \
      exit 1; \
    fi \
 && ls server/packages/drizzle-migration/dist/virtual_drizzle-migrations-*.mjs >/dev/null

RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server-node-shared run build
RUN pnpm -F @proj-airi/api-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
