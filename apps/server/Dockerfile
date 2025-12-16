FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
