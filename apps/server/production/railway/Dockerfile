FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY patches/ ./patches/
COPY apps/server apps/server
COPY packages/server-schema packages/server-schema
COPY packages/server-sdk-shared packages/server-sdk-shared

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @proj-airi/server-schema run build
RUN pnpm -F @proj-airi/server-sdk-shared run build
RUN pnpm -F @proj-airi/server run build

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
