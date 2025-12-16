FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server apps/server

RUN pnpm install --frozen-lockfile --ignore-scripts

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
