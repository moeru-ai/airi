---
name: pnpm-performance-optimization
description: Tips and tricks for faster installs and better performance
---

# pnpm Performance Optimization

pnpm is fast by default, but these optimizations can make it even faster.

## Install Optimizations

### Use Frozen Lockfile

Skip resolution when lockfile exists:

```bash
pnpm install --frozen-lockfile
```

This is faster because pnpm skips the resolution phase entirely.

### Prefer Offline Mode

Use cached packages when available:

```bash
pnpm install --prefer-offline
```

Or configure globally:

```ini
# .npmrc
prefer-offline=true
```

### Skip Optional Dependencies

If you don't need optional deps:

```bash
pnpm install --no-optional
```

### Skip Scripts

For CI or when scripts aren't needed:

```bash
pnpm install --ignore-scripts
```

**Caution:** Some packages require postinstall scripts to work correctly.

### Only Build Specific Dependencies

Only run build scripts for specific packages:

```ini
# .npmrc
onlyBuiltDependencies[]=esbuild
onlyBuiltDependencies[]=sharp
onlyBuiltDependencies[]=@swc/core
```

Or skip builds entirely for deps that don't need them:

```json
{
  "pnpm": {
    "neverBuiltDependencies": ["fsevents", "cpu-features"]
  }
}
```

## Store Optimizations

### Side Effects Cache

Cache native module build results:

```ini
# .npmrc
side-effects-cache=true
```

This caches the results of postinstall scripts, speeding up subsequent installs.

### Shared Store

Use a single store for all projects (default behavior):

```ini
# .npmrc
store-dir=~/.pnpm-store
```

Benefits:

- Packages downloaded once for all projects
- Hard links save disk space
- Faster installs from cache

### Store Maintenance

Periodically clean unused packages:

```bash
# Remove unreferenced packages
pnpm store prune

# Check store integrity
pnpm store status
```

## Workspace Optimizations

### Parallel Execution

Run workspace scripts in parallel:

```bash
pnpm -r --parallel run build
```

Control concurrency:

```ini
# .npmrc
workspace-concurrency=8
```

### Stream Output

See output in real-time:

```bash
pnpm -r --stream run build
```

### Filter to Changed Packages

Only build what changed:

```bash
# Build packages changed since main branch
pnpm --filter "...[origin/main]" run build
```

### Topological Order

Build dependencies before dependents:

```bash
pnpm -r run build
# Automatically runs in topological order
```

For explicit sequential builds:

```bash
pnpm -r --workspace-concurrency=1 run build
```

## Network Optimizations

### Configure Registry

Use closest/fastest registry:

```ini
# .npmrc
registry=https://registry.npmmirror.com/
```

### HTTP Settings

Tune network settings:

```ini
# .npmrc
fetch-retries=3
fetch-retry-mintimeout=10000
fetch-retry-maxtimeout=60000
network-concurrency=16
```

### Proxy Configuration

```ini
# .npmrc
proxy=http://proxy.company.com:8080
https-proxy=http://proxy.company.com:8080
```

## Lockfile Optimization

### Single Lockfile (Monorepos)

Use shared lockfile for all packages (default):

```ini
# .npmrc
shared-workspace-lockfile=true
```

Benefits:

- Single source of truth
- Faster resolution
- Consistent versions across workspace

### Lockfile-only Mode

Only update lockfile without installing:

```bash
pnpm install --lockfile-only
```

## Benchmarking

### Compare Install Times

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
time pnpm install

# Cached install (with lockfile)
rm -rf node_modules
time pnpm install --frozen-lockfile

# With store cache
time pnpm install --frozen-lockfile --prefer-offline
```

### Profile Resolution

Debug slow installs:

```bash
# Verbose logging
pnpm install --reporter=append-only

# Debug mode
DEBUG=pnpm:* pnpm install
```

## Configuration Summary

Optimized `.npmrc` for performance:

```ini
# Install behavior
prefer-offline=true
auto-install-peers=true

# Build optimization
side-effects-cache=true
# Only build what's necessary
onlyBuiltDependencies[]=esbuild
onlyBuiltDependencies[]=@swc/core

# Network
fetch-retries=3
network-concurrency=16

# Workspace
workspace-concurrency=4
```

## Quick Reference

| Scenario            | Command/Setting                          |
| ------------------- | ---------------------------------------- |
| CI installs         | `pnpm install --frozen-lockfile`         |
| Offline development | `--prefer-offline`                       |
| Skip native builds  | `neverBuiltDependencies`                 |
| Parallel workspace  | `pnpm -r --parallel run build`           |
| Build changed only  | `pnpm --filter "...[origin/main]" build` |
| Clean store         | `pnpm store prune`                       |

<!--
Source references:
- https://pnpm.io/npmrc
- https://pnpm.io/cli/install
- https://pnpm.io/filtering
-->
