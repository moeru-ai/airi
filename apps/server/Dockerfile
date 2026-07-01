FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY apps/server apps/server
COPY packages/server-schema packages/server-schema
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

# NOTICE:
# Force a fresh build of server-schema and assert that the generated migration
# source compiled without a virtual module specifier. Railway has intermittently
# observed rolldown virtual-module transforms no-op'ing in this layer; the
# package now generates a real TypeScript source file before tsdown so the
# deployment no longer depends on that transform for migrations.
RUN rm -rf packages/server-schema/dist \
 && pnpm -F @proj-airi/server-schema run build \
 && if grep -qE "from ['\"]virtual:" packages/server-schema/dist/index.mjs; then \
      echo "ERROR: server-schema dist/index.mjs still references a virtual: specifier." >&2; \
      cat packages/server-schema/dist/index.mjs >&2; \
      exit 1; \
    fi \
 && grep -q "migrations" packages/server-schema/dist/index.mjs

RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server run build

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
