FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches/ ./patches/
COPY apps/server apps/server

# https://docs.railway.com/guides/dockerfiles#cache-mounts
# --mount=type=cache,id=s/<service id>-<target path>,target=<target path>
RUN --mount=type=cache,id=s/fec8bf0d-37e0-4283-8202-5f1bd7e6cd0e-/root/.pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/server", "start"]
