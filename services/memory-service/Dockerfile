FROM node:24-alpine

# Install build tools and libraries
RUN apk add --no-cache python3 make g++ bash curl libc6-compat git

WORKDIR /app

# Install pnpm globally
RUN apk add --no-cache postgresql-client
RUN npm install -g pnpm

# Copy workspace lockfiles first to leverage cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy packages and memory service package.json
COPY packages/ ./packages/
COPY services/memory-service/package.json ./services/memory-service/

# Install dependencies (fallback if frozen-lockfile fails)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy the full memory service source code
COPY services/memory-service/ ./services/memory-service/

# Set working directory to memory service
WORKDIR /app/services/memory-service

# Build the application
RUN pnpm build

# Expose port
EXPOSE 3001

# Start the service
CMD ["pnpm", "start"]
