FROM node:24-alpine

WORKDIR /app

RUN addgroup -S airi && adduser -S airi -G airi

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY server/apps/api server/apps/api
COPY server/packages/auth-shared server/packages/auth-shared
COPY server/packages/drizzle-migration server/packages/drizzle-migration
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

# NOTICE:
# The Rolldown adapter of unplugin-drizzle-orm-migrations intermittently left
# the virtual import in the output on Railway. The Rollup adapter is compatible
# with tsdown and inlines the migration data. Import the output to verify the
# runtime contract. Do not check a generated chunk name because adapters use
# different output layouts.
RUN rm -rf server/packages/drizzle-migration/dist \
 && pnpm -F @proj-airi/drizzle-migration run build \
 && node --input-type=module -e "import('./server/packages/drizzle-migration/dist/index.mjs').then(({ migrations }) => { if (!Array.isArray(migrations) || migrations.length === 0) throw new Error('drizzle-migration did not export migrations') })"

RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/api-server run build

EXPOSE 3000

USER airi

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
