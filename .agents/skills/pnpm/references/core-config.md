---
name: pnpm-configuration
description: Configuration options via pnpm-workspace.yaml and .npmrc settings
---

# pnpm Configuration

pnpm uses two main configuration files: `pnpm-workspace.yaml` for workspace and pnpm-specific settings, and `.npmrc` for npm-compatible and pnpm-specific settings.

## pnpm-workspace.yaml

The recommended location for pnpm-specific configurations. Place at project root.

```yaml
# Define workspace packages
packages:
  - 'packages/*'
  - 'apps/*'
  - '!**/test/**' # Exclude pattern

# Catalog for shared dependency versions
catalog:
  react: ^18.2.0
  typescript: ~5.3.0

# Named catalogs for different dependency groups
catalogs:
  react17:
    react: ^17.0.2
    react-dom: ^17.0.2
  react18:
    react: ^18.2.0
    react-dom: ^18.2.0

# Override resolutions (preferred location)
overrides:
  lodash: ^4.17.21
  'foo@^1.0.0>bar': ^2.0.0

# pnpm settings (alternative to .npmrc)
settings:
  auto-install-peers: true
  strict-peer-dependencies: false
  link-workspace-packages: true
  prefer-workspace-packages: true
  shared-workspace-lockfile: true
```

## .npmrc Settings

pnpm reads settings from `.npmrc` files. Create at project root or user home.

### Common pnpm Settings

```ini
# Automatically install peer dependencies
auto-install-peers=true

# Fail on peer dependency issues
strict-peer-dependencies=false

# Hoist patterns for dependencies
public-hoist-pattern[]=*types*
public-hoist-pattern[]=*eslint*
shamefully-hoist=false

# Store location
store-dir=~/.pnpm-store

# Virtual store location
virtual-store-dir=node_modules/.pnpm

# Lockfile settings
lockfile=true
prefer-frozen-lockfile=true

# Side effects cache (speeds up rebuilds)
side-effects-cache=true

# Registry settings
registry=https://registry.npmjs.org/
@myorg:registry=https://npm.myorg.com/
```

### Workspace Settings

```ini
# Link workspace packages
link-workspace-packages=true

# Prefer workspace packages over registry
prefer-workspace-packages=true

# Single lockfile for all packages
shared-workspace-lockfile=true

# Save prefix for workspace dependencies
save-workspace-protocol=rolling
```

### Node.js Settings

```ini
# Use specific Node.js version
use-node-version=20.10.0

# Node.js version file
node-version-file=.nvmrc

# Manage Node.js versions
manage-package-manager-versions=true
```

### Security Settings

```ini
# Ignore specific scripts
ignore-scripts=false

# Allow specific build scripts
onlyBuiltDependencies[]=esbuild
onlyBuiltDependencies[]=sharp

# Package extensions for missing peer deps
package-extensions[foo@1].peerDependencies.bar=*
```

## Configuration Hierarchy

Settings are read in order (later overrides earlier):

1. `/etc/npmrc` - Global config
2. `~/.npmrc` - User config
3. `<project>/.npmrc` - Project config
4. Environment variables: `npm_config_<key>=<value>`
5. `pnpm-workspace.yaml` settings field

## Environment Variables

```bash
# Set config via env
npm_config_registry=https://registry.npmjs.org/

# pnpm-specific env vars
PNPM_HOME=~/.local/share/pnpm
```

## Package.json Fields

pnpm reads specific fields from `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "lodash": "^4.17.21"
    },
    "peerDependencyRules": {
      "ignoreMissing": ["@babel/*"],
      "allowedVersions": {
        "react": "17 || 18"
      }
    },
    "neverBuiltDependencies": ["fsevents"],
    "onlyBuiltDependencies": ["esbuild"],
    "allowedDeprecatedVersions": {
      "request": "*"
    },
    "patchedDependencies": {
      "express@4.18.2": "patches/express@4.18.2.patch"
    }
  }
}
```

## Key Differences from npm/yarn

1. **Strict by default**: No phantom dependencies
2. **Workspace protocol**: `workspace:*` for local packages
3. **Catalogs**: Centralized version management
4. **Content-addressable store**: Shared across projects

<!--
Source references:
- https://pnpm.io/pnpm-workspace_yaml
- https://pnpm.io/npmrc
- https://pnpm.io/package_json
-->
