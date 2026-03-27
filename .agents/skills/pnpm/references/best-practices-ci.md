---
name: pnpm-ci-cd-setup
description: Optimizing pnpm for continuous integration and deployment workflows
---

# pnpm CI/CD Setup

Best practices for using pnpm in CI/CD environments for fast, reliable builds.

## GitHub Actions

### Basic Setup

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
```

### With Store Caching

For larger projects, cache the pnpm store:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9

- name: Get pnpm store directory
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- uses: actions/cache@v4
  name: Setup pnpm cache
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-

- run: pnpm install --frozen-lockfile
```

### Matrix Testing

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

## GitLab CI

```yaml
image: node:20

stages:
  - install
  - test
  - build

variables:
  PNPM_HOME: /root/.local/share/pnpm
  PATH: $PNPM_HOME:$PATH

before_script:
  - corepack enable
  - corepack prepare pnpm@latest --activate

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .pnpm-store

install:
  stage: install
  script:
    - pnpm config set store-dir .pnpm-store
    - pnpm install --frozen-lockfile

test:
  stage: test
  script:
    - pnpm test

build:
  stage: build
  script:
    - pnpm build
```

## Docker

### Multi-Stage Build

```dockerfile
# Build stage
FROM node:20-slim AS builder

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production stage
FROM node:20-slim AS runner

RUN corepack enable
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Production install
RUN pnpm install --frozen-lockfile --prod

CMD ["node", "dist/index.js"]
```

### Optimized for Monorepos

```dockerfile
FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files maintaining structure
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build specific package
RUN pnpm --filter @myorg/api build
```

## Key CI Flags

### --frozen-lockfile

**Always use in CI.** Fails if `pnpm-lock.yaml` needs updates:

```bash
pnpm install --frozen-lockfile
```

### --prefer-offline

Use cached packages when available:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

### --ignore-scripts

Skip lifecycle scripts for faster installs (use cautiously):

```bash
pnpm install --frozen-lockfile --ignore-scripts
```

## Corepack Integration

Use Corepack to manage pnpm version:

```json
// package.json
{
  "packageManager": "pnpm@9.0.0"
}
```

```yaml
# GitHub Actions
- run: corepack enable
- run: pnpm install --frozen-lockfile
```

## Monorepo CI Strategies

### Build Changed Packages Only

```yaml
- name: Build changed packages
  run: |
    pnpm --filter "...[origin/main]" build
```

### Parallel Jobs per Package

```yaml
jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      packages: ${{ steps.changes.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: changes
        run: |
          echo "packages=$(pnpm --filter '...[origin/main]' list --json | jq -c '[.[].name]')" >> $GITHUB_OUTPUT

  test:
    needs: detect-changes
    if: needs.detect-changes.outputs.packages != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: ${{ fromJson(needs.detect-changes.outputs.packages) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ${{ matrix.package }} test
```

## Best Practices Summary

1. **Always use `--frozen-lockfile`** in CI
2. **Cache the pnpm store** for faster installs
3. **Use Corepack** for consistent pnpm versions
4. **Specify `packageManager`** in package.json
5. **Use `--filter`** in monorepos to build only what changed
6. **Multi-stage Docker builds** for smaller images

<!--
Source references:
- https://pnpm.io/continuous-integration
- https://github.com/pnpm/action-setup
-->
