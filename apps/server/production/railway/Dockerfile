FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY --from=ghcr.io/moeru-ai/airi/ui-server-auth:latest /app/airi/projects/ui/ui-server-auth apps/server/public/ui-server-auth
COPY apps/server apps/server
COPY packages/server-schema packages/server-schema
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN pnpm install --frozen-lockfile --ignore-scripts

# NOTICE:
# Force a fresh build of server-schema and assert that
# unplugin-drizzle-orm-migrations actually replaced the `virtual:drizzle-migrations.sql`
# import. Without this guard a layer built when the rolldown plugin silently
# no-op'd (intermittently observed on Railway with tsdown 0.21.9 + rolldown
# 1.0.0-rc.16) ships a dist/index.mjs that re-exports the literal `virtual:`
# specifier, which crashes at runtime under tsx with
# ERR_UNSUPPORTED_ESM_URL_SCHEME. `rm -rf dist` keeps this RUN's command-string
# distinct from earlier cached variants and prevents a stale dist from masking
# a failed transform.
RUN rm -rf packages/server-schema/dist \
 && pnpm -F @proj-airi/server-schema run build \
 && if grep -qE "from ['\"]virtual:" packages/server-schema/dist/index.mjs; then \
      echo "ERROR: server-schema dist/index.mjs still references a virtual: specifier — unplugin-drizzle-orm-migrations transform did not run." >&2; \
      cat packages/server-schema/dist/index.mjs >&2; \
      exit 1; \
    fi \
 && ls packages/server-schema/dist/virtual_drizzle-migrations-*.mjs >/dev/null

RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server run build

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
