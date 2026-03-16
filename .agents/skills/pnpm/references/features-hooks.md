---
name: pnpm-hooks
description: Customize package resolution and dependency behavior with pnpmfile hooks
---

# pnpm Hooks

pnpm provides hooks via `.pnpmfile.cjs` to customize how packages are resolved and their metadata is processed.

## Setup

Create `.pnpmfile.cjs` at workspace root:

```js
// .pnpmfile.cjs
function readPackage(pkg, context) {
  // Modify package metadata
  return pkg
}

function afterAllResolved(lockfile, context) {
  // Modify lockfile
  return lockfile
}

module.exports = {
  hooks: {
    readPackage,
    afterAllResolved
  }
}
```

## readPackage Hook

Called for every package before resolution. Use to modify dependencies, add missing peer deps, or fix broken packages.

### Add Missing Peer Dependency

```js
function readPackage(pkg, context) {
  if (pkg.name === 'some-broken-package') {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      react: '*'
    }
    context.log(`Added react peer dep to ${pkg.name}`)
  }
  return pkg
}
```

### Override Dependency Version

```js
function readPackage(pkg, context) {
  // Fix all lodash versions
  if (pkg.dependencies?.lodash) {
    pkg.dependencies.lodash = '^4.17.21'
  }
  if (pkg.devDependencies?.lodash) {
    pkg.devDependencies.lodash = '^4.17.21'
  }
  return pkg
}
```

### Remove Unwanted Dependency

```js
function readPackage(pkg, context) {
  // Remove optional dependency that causes issues
  if (pkg.optionalDependencies?.fsevents) {
    delete pkg.optionalDependencies.fsevents
  }
  return pkg
}
```

### Replace Package

```js
function readPackage(pkg, context) {
  // Replace deprecated package
  if (pkg.dependencies?.['old-package']) {
    pkg.dependencies['new-package'] = pkg.dependencies['old-package']
    delete pkg.dependencies['old-package']
  }
  return pkg
}
```

### Fix Broken Package

```js
function readPackage(pkg, context) {
  // Fix incorrect exports field
  if (pkg.name === 'broken-esm-package') {
    pkg.exports = {
      '.': {
        import: './dist/index.mjs',
        require: './dist/index.cjs'
      }
    }
  }
  return pkg
}
```

## afterAllResolved Hook

Called after the lockfile is generated. Use for post-resolution modifications.

```js
function afterAllResolved(lockfile, context) {
  // Log all resolved packages
  context.log(`Resolved ${Object.keys(lockfile.packages || {}).length} packages`)

  // Modify lockfile if needed
  return lockfile
}
```

## Context Object

The `context` object provides utilities:

```js
function readPackage(pkg, context) {
  // Log messages
  context.log('Processing package...')

  return pkg
}
```

## Use with TypeScript

For type hints, use JSDoc:

```js
// .pnpmfile.cjs

/**
 * @param {import('type-fest').PackageJson} pkg
 * @param {{ log: (msg: string) => void }} context
 * @returns {import('type-fest').PackageJson}
 */
function readPackage(pkg, context) {
  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
```

## Common Patterns

### Conditional by Package Name

```js
function readPackage(pkg, context) {
  switch (pkg.name) {
    case 'package-a':
      pkg.dependencies.foo = '^2.0.0'
      break
    case 'package-b':
      delete pkg.optionalDependencies.bar
      break
  }
  return pkg
}
```

### Apply to All Packages

```js
function readPackage(pkg, context) {
  // Remove all optional fsevents
  if (pkg.optionalDependencies) {
    delete pkg.optionalDependencies.fsevents
  }
  return pkg
}
```

### Debug Resolution

```js
function readPackage(pkg, context) {
  if (process.env.DEBUG_PNPM) {
    context.log(`${pkg.name}@${pkg.version}`)
    context.log(`  deps: ${Object.keys(pkg.dependencies || {}).join(', ')}`)
  }
  return pkg
}
```

## Hooks vs Overrides

| Feature | Hooks (.pnpmfile.cjs) | Overrides |
|---------|----------------------|-----------|
| Complexity | Can use JavaScript logic | Declarative only |
| Scope | Any package metadata | Version only |
| Use case | Complex fixes, conditional logic | Simple version pins |

**Prefer overrides** for simple version fixes. **Use hooks** when you need:
- Conditional logic
- Non-version modifications (exports, peer deps)
- Logging/debugging

## Troubleshooting

### Hook not running

1. Ensure file is named `.pnpmfile.cjs` (not `.js`)
2. Check file is at workspace root
3. Run `pnpm install` to trigger hooks

### Debug hooks

```bash
# See hook logs
pnpm install --reporter=append-only
```

<!--
Source references:
- https://pnpm.io/pnpmfile
-->
