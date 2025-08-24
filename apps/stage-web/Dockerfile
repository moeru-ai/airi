FROM node:24-trixie AS build-stage

WORKDIR /app

RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y python3 curl

RUN corepack enable

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

RUN pnpm -F @proj-airi/stage-web run build && \
    pnpm -F @proj-airi/docs run build:base && \
    mv ./docs/.vitepress/dist ./apps/stage-web/dist/docs && \
    pnpm -F @proj-airi/stage-ui run story:build && \
    mv ./packages/stage-ui/.histoire/dist ./apps/stage-web/dist/ui

FROM nginx:stable-alpine AS production-stage

COPY --from=build-stage /app/apps/stage-web/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
