---
name: migration-to-pnpm
description: Migrating from npm or Yarn to pnpm with minimal friction
---

# Migration to pnpm

Guide for migrating existing projects from npm or Yarn to pnpm.

## Quick Migration

### From npm

```bash
# Remove npm lockfile and node_modules
rm -rf node_modules package-lock.json

# Install with pnpm
pnpm install
```

### From Yarn

```bash
# Remove yarn lockfile and node_modules
rm -rf node_modules yarn.lock

# Install with pnpm
pnpm install
```

### Import Existing Lockfile

pnpm can import existing lockfiles:

```bash
# Import from npm or yarn lockfile
pnpm import

# This creates pnpm-lock.yaml from:
# - package-lock.json (npm)
# - yarn.lock (yarn)
# - npm-shrinkwrap.json (npm)
```

## Handling Common Issues

### Phantom Dependencies

pnpm is strict about dependencies. If code imports a package not in `package.json`, it will fail.

**Problem:**
```js
// Works with npm (hoisted), fails with pnpm
import lodash from 'lodash' // Not in dependencies, installed by another package
```

**Solution:** Add missing dependencies explicitly:
```bash
pnpm add lodash
```

### Missing Peer Dependencies

pnpm reports peer dependency issues by default.

**Option 1:** Let pnpm auto-install:
```ini
# .npmrc (default in pnpm v8+)
auto-install-peers=true
```

**Option 2:** Install manually:
```bash
pnpm add react react-dom
```

**Option 3:** Suppress warnings if acceptable:
```json
{
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": ["react"]
    }
  }
}
```

### Symlink Issues

Some tools don't work with symlinks. Use hoisted mode:

```ini
# .npmrc
node-linker=hoisted
```

Or hoist specific packages:

```ini
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*babel*
```

### Native Module Rebuilds

If native modules fail, try:

```bash
# Rebuild all native modules
pnpm rebuild

# Or reinstall
rm -rf node_modules
pnpm install
```

## Monorepo Migration

### From npm Workspaces

1. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'packages/*'
   ```

2. Update internal dependencies to use workspace protocol:
   ```json
   {
     "dependencies": {
       "@myorg/utils": "workspace:^"
     }
   }
   ```

3. Install:
   ```bash
   rm -rf node_modules packages/*/node_modules package-lock.json
   pnpm install
   ```

### From Yarn Workspaces

1. Remove Yarn-specific files:
   ```bash
   rm yarn.lock .yarnrc.yml
   rm -rf .yarn
   ```

2. Create `pnpm-workspace.yaml` matching `workspaces` in package.json:
   ```yaml
   packages:
     - 'packages/*'
   ```

3. Update `package.json` - remove Yarn workspace config if not needed:
   ```json
   {
     // Remove "workspaces" field (optional, pnpm uses pnpm-workspace.yaml)
   }
   ```

4. Convert workspace references:
   ```json
   // From Yarn
   "@myorg/utils": "*"

   // To pnpm
   "@myorg/utils": "workspace:*"
   ```

### From Lerna

pnpm can replace Lerna for most use cases:

```bash
# Lerna: run script in all packages
lerna run build

# pnpm equivalent
pnpm -r run build

# Lerna: run in specific package
lerna run build --scope=@myorg/app

# pnpm equivalent
pnpm --filter @myorg/app run build

# Lerna: publish
lerna publish

# pnpm: use changesets instead
pnpm add -Dw @changesets/cli
pnpm changeset
pnpm changeset version
pnpm publish -r
```

## Configuration Migration

### .npmrc Settings

Most npm/Yarn settings work in pnpm's `.npmrc`:

```ini
# Registry settings (same as npm)
registry=https://registry.npmjs.org/
@myorg:registry=https://npm.myorg.com/

# Auth tokens (same as npm)
//registry.npmjs.org/:_authToken=${NPM_TOKEN}

# pnpm-specific additions
auto-install-peers=true
strict-peer-dependencies=false
```

### Scripts Migration

Most scripts work unchanged. Update pnpm-specific patterns:

```json
{
  "scripts": {
    // npm: recursive scripts
    "build:all": "npm run build --workspaces",
    // pnpm: use -r flag
    "build:all": "pnpm -r run build",

    // npm: run in specific workspace
    "dev:app": "npm run dev -w packages/app",
    // pnpm: use --filter
    "dev:app": "pnpm --filter @myorg/app run dev"
  }
}
```

## CI/CD Migration

Update CI configuration:

```yaml
# Before (npm)
- run: npm ci

# After (pnpm)
- uses: pnpm/action-setup@v4
- run: pnpm install --frozen-lockfile
```

Add to `package.json` for Corepack:
```json
{
  "packageManager": "pnpm@9.0.0"
}
```

## Gradual Migration

For large projects, migrate gradually:

1. **Start with CI**: Use pnpm in CI, keep npm/yarn locally
2. **Add pnpm-lock.yaml**: Run `pnpm import` to create lockfile
3. **Test thoroughly**: Ensure builds work with pnpm
4. **Update documentation**: Update README, CONTRIBUTING
5. **Remove old files**: Delete old lockfiles after team adoption

## Rollback Plan

If migration causes issues:

```bash
# Remove pnpm files
rm -rf node_modules pnpm-lock.yaml pnpm-workspace.yaml

# Restore npm
npm install

# Or restore Yarn
yarn install
```

Keep old lockfile in git history for easy rollback.

<!--
Source references:
- https://pnpm.io/installation
- https://pnpm.io/cli/import
- https://pnpm.io/limitations
-->
