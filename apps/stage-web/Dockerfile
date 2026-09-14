FROM node:24-trixie AS build-stage

WORKDIR /app

ARG VITE_ENABLE_ANALYTICS=false
ENV VITE_ENABLE_ANALYTICS=${VITE_ENABLE_ANALYTICS}

RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y build-essential python3 python3-setuptools curl

# NOTICE:
# The Bun binary must match the base image libc. node:24-trixie is glibc, so the
# binary is copied from the default (Debian) Bun image instead of installing Bun
# with npm. Keep this tag in step with `packageManager` in the root manifest.
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

COPY . .
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

RUN bun run --filter @proj-airi/stage-web build && \
    bun run --filter @proj-airi/docs build:base && \
    mv ./docs/.vitepress/dist ./apps/stage-web/dist/docs && \
    bun run --filter @proj-airi/stage-ui story:build && \
    mv ./packages/stage-ui/.histoire/dist ./apps/stage-web/dist/ui

FROM nginx:stable-alpine AS production-stage

COPY --from=build-stage /app/apps/stage-web/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
