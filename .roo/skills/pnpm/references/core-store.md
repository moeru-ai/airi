---
name: pnpm-store
description: Content-addressable storage system that makes pnpm fast and disk-efficient
---

# pnpm Store

pnpm uses a content-addressable store to save disk space and speed up installations. All packages are stored once globally and hard-linked to project `node_modules`.

## How It Works

1. **Global Store**: Packages are downloaded once to a central store
2. **Hard Links**: Projects link to store instead of copying files
3. **Content-Addressable**: Files are stored by content hash, deduplicating identical files

### Storage Layout

```
~/.pnpm-store/              # Global store (default location)
└── v3/
    └── files/
        └── <hash>/         # Files stored by content hash

project/
└── node_modules/
    ├── .pnpm/              # Virtual store (hard links to global store)
    │   ├── lodash@4.17.21/
    │   │   └── node_modules/
    │   │       └── lodash/
    │   └── express@4.18.2/
    │       └── node_modules/
    │           ├── express/
    │           └── <deps>/  # Flat structure for dependencies
    ├── lodash -> .pnpm/lodash@4.17.21/node_modules/lodash
    └── express -> .pnpm/express@4.18.2/node_modules/express
```

## Store Commands

```bash
# Show store location
pnpm store path

# Remove unreferenced packages
pnpm store prune

# Check store integrity
pnpm store status

# Add package to store without installing
pnpm store add <pkg>
```

## Configuration

### Store Location

```ini
# .npmrc
store-dir=~/.pnpm-store

# Or use environment variable
PNPM_HOME=~/.local/share/pnpm
```

### Virtual Store

The virtual store (`.pnpm` in `node_modules`) contains symlinks to the global store:

```ini
# Customize virtual store location
virtual-store-dir=node_modules/.pnpm

# Alternative flat layout
node-linker=hoisted
```

## Disk Space Benefits

pnpm saves significant disk space:

- **Deduplication**: Same package version stored once across all projects
- **Content deduplication**: Identical files across different packages stored once
- **Hard links**: No copying, just linking

### Check disk usage

```bash
# Compare actual vs apparent size
du -sh node_modules        # Apparent size
du -sh --apparent-size node_modules  # With hard links counted
```

## Node Linker Modes

Configure how `node_modules` is structured:

```ini
# Default: Symlinked structure (recommended)
node-linker=isolated

# Flat node_modules (npm-like, for compatibility)
node-linker=hoisted

# PnP mode (experimental, like Yarn PnP)
node-linker=pnp
```

### Isolated Mode (Default)

- Strict dependency resolution
- No phantom dependencies
- Packages can only access declared dependencies

### Hoisted Mode

- Flat `node_modules` like npm
- For compatibility with tools that don't support symlinks
- Loses strictness benefits

## Side Effects Cache

Cache build outputs for native modules:

```ini
# Enable side effects caching
side-effects-cache=true

# Store side effects in project (instead of global store)
side-effects-cache-readonly=true
```

## Shared Store Across Machines

For CI/CD, you can share the store:

```yaml
# GitHub Actions example
- uses: pnpm/action-setup@v4
  with:
    run_install: false

- name: Get pnpm store directory
  shell: bash
  run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
```

## Troubleshooting

### Store corruption

```bash
# Verify and fix store
pnpm store status
pnpm store prune
```

### Hard link issues (network drives, Docker)

```ini
# Use copying instead of hard links
package-import-method=copy
```

### Permission issues

```bash
# Fix store permissions
chmod -R u+w ~/.pnpm-store
```

<!--
Source references:
- https://pnpm.io/symlinked-node-modules-structure
- https://pnpm.io/cli/store
- https://pnpm.io/npmrc#store-dir
-->
