FROM node:18-alpine

# Install Python and build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace files first (including turbo.json)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy the packages directory for workspace dependencies
COPY packages/ ./packages/

# Copy the memory service package.json
COPY services/memory-service/package.json ./services/memory-service/

# Install dependencies (native modules will compile with Python available)
RUN pnpm install --frozen-lockfile

# Copy the memory service source code
COPY services/memory-service/ ./services/memory-service/

# Set working directory to memory service
WORKDIR /app/services/memory-service

# Build the application
RUN pnpm build

# Expose port
EXPOSE 3001

# Start the service
CMD ["pnpm", "start"] 