FROM node:22-alpine AS base

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN corepack enable
RUN pnpm install --no-frozen-lockfile

CMD ["pnpm", "start"]
