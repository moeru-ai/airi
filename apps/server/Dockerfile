FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches/ ./patches/
COPY apps/server apps/server

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
