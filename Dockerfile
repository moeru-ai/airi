FROM node:22-alpine as build-stage

WORKDIR /app

RUN corepack enable
COPY .npmrc package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# SSR
FROM node:22-alpine as production-stage

WORKDIR /app

COPY --from=build-stage /app/.output ./.output

CMD ["node", ".output/server/index.mjs"]
