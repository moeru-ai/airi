FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "-F", "@proj-airi/api-server", "start"]
