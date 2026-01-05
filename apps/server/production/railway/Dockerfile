FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server apps/server

# https://docs.railway.com/guides/dockerfiles#cache-mounts
# --mount=type=cache,id=s/<service id>-<target path>,target=<target path>
RUN --mount=type=cache,id=s/cf17b143-327a-4f8e-bb34-27ca77380109-/root/.pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts

EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
