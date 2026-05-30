---
name: pnpm-cli-commands
description: Essential pnpm commands for package management, running scripts, and workspace operations
---

# pnpm CLI Commands

pnpm provides a comprehensive CLI for package management with commands similar to npm/yarn but with unique features.

## Installation Commands

### Install all dependencies

```bash
pnpm install
# or
pnpm i
```

### Add a dependency

```bash
# Production dependency
pnpm add <pkg>

# Dev dependency
pnpm add -D <pkg>
pnpm add --save-dev <pkg>

# Optional dependency
pnpm add -O <pkg>

# Global package
pnpm add -g <pkg>

# Specific version
pnpm add <pkg>@<version>
pnpm add <pkg>@next
pnpm add <pkg>@^1.0.0
```

### Remove a dependency

```bash
pnpm remove <pkg>
pnpm rm <pkg>
pnpm uninstall <pkg>
pnpm un <pkg>
```

### Update dependencies

```bash
# Update all
pnpm update
pnpm up

# Update specific package
pnpm update <pkg>

# Update to latest (ignore semver)
pnpm update --latest
pnpm up -L

# Interactive update
pnpm update --interactive
pnpm up -i
```

## Script Commands

### Run scripts

```bash
pnpm run <script>
# or shorthand
pnpm <script>

# Pass arguments to script
pnpm run build -- --watch

# Run script if exists (no error if missing)
pnpm run --if-present build
```

### Execute binaries

```bash
# Run local binary
pnpm exec <command>

# Example
pnpm exec eslint .
```

### dlx - Run without installing

```bash
# Like npx but for pnpm
pnpm dlx <pkg>

# Examples
pnpm dlx create-vite my-app
pnpm dlx degit user/repo my-project
```

## Workspace Commands

### Run in all packages

```bash
# Run script in all workspace packages
pnpm -r run <script>
pnpm --recursive run <script>

# Run in specific packages
pnpm --filter <pattern> run <script>

# Examples
pnpm --filter "./packages/**" run build
pnpm --filter "!./packages/internal/**" run test
pnpm --filter "@myorg/*" run lint
```

### Filter patterns

```bash
# By package name
pnpm --filter <pkg-name> <command>
pnpm --filter "@scope/pkg" build

# By directory
pnpm --filter "./packages/core" test

# Dependencies of a package
pnpm --filter "...@scope/app" build

# Dependents of a package
pnpm --filter "@scope/core..." test

# Changed packages since commit/branch
pnpm --filter "...[origin/main]" build
```

## Other Useful Commands

### Link packages

```bash
# Link global package
pnpm link --global
pnpm link -g

# Use linked package
pnpm link --global <pkg>
```

### Patch packages

```bash
# Create patch for a package
pnpm patch <pkg>@<version>

# After editing, commit the patch
pnpm patch-commit <path>

# Remove a patch
pnpm patch-remove <pkg>
```

### Store management

```bash
# Show store path
pnpm store path

# Remove unreferenced packages
pnpm store prune

# Check store integrity
pnpm store status
```

### Other commands

```bash
# Clean install (like npm ci)
pnpm install --frozen-lockfile

# List installed packages
pnpm list
pnpm ls

# Why is package installed?
pnpm why <pkg>

# Outdated packages
pnpm outdated

# Audit for vulnerabilities
pnpm audit

# Rebuild native modules
pnpm rebuild

# Import from npm/yarn lockfile
pnpm import

# Create tarball
pnpm pack

# Publish package
pnpm publish
```

## Useful Flags

```bash
# Ignore scripts
pnpm install --ignore-scripts

# Prefer offline (use cache)
pnpm install --prefer-offline

# Strict peer dependencies
pnpm install --strict-peer-dependencies

# Production only
pnpm install --prod
pnpm install -P

# No optional dependencies
pnpm install --no-optional
```

<!--
Source references:
- https://pnpm.io/cli/install
- https://pnpm.io/cli/add
- https://pnpm.io/cli/run
- https://pnpm.io/filtering
-->
