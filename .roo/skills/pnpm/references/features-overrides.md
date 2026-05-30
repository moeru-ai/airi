---
name: pnpm-overrides
description: Force specific versions of dependencies including transitive dependencies
---

# pnpm Overrides

Overrides let you force specific versions of packages, including transitive dependencies. Useful for fixing security vulnerabilities or compatibility issues.

## Basic Syntax

Define overrides in `pnpm-workspace.yaml` (recommended) or `package.json`:

### In pnpm-workspace.yaml (Recommended)

```yaml
packages:
  - 'packages/*'

overrides:
  # Override all versions of a package
  lodash: ^4.17.21

  # Override specific version range
  'foo@^1.0.0': ^1.2.3

  # Override nested dependency
  'express>cookie': ^0.6.0

  # Override to different package
  'underscore': 'npm:lodash@^4.17.21'
```

### In package.json

```json
{
  "pnpm": {
    "overrides": {
      "lodash": "^4.17.21",
      "foo@^1.0.0": "^1.2.3",
      "bar@^2.0.0>qux": "^1.0.0"
    }
  }
}
```

## Override Patterns

### Override all instances

```yaml
overrides:
  lodash: ^4.17.21
```

Forces all lodash installations to use ^4.17.21.

### Override specific parent version

```yaml
overrides:
  'foo@^1.0.0': ^1.2.3
```

Only override foo when the requested version matches ^1.0.0.

### Override nested dependency

```yaml
overrides:
  'express>cookie': ^0.6.0
  'foo@1.x>bar@^2.0.0>qux': ^1.0.0
```

Override cookie only when it's a dependency of express.

### Replace with different package

```yaml
overrides:
  # Replace underscore with lodash
  "underscore": "npm:lodash@^4.17.21"

  # Use local file
  "some-pkg": "file:./local-pkg"

  # Use git
  "some-pkg": "github:user/repo#commit"
```

### Remove a dependency

```yaml
overrides:
  'unwanted-pkg': '-'
```

The `-` removes the package entirely.

## Common Use Cases

### Security Fix

Force patched version of vulnerable package:

```yaml
overrides:
  # Fix CVE in transitive dependency
  'minimist': '^1.2.6'
  'json5': '^2.2.3'
```

### Deduplicate Dependencies

Force single version when multiple are installed:

```yaml
overrides:
  'react': '^18.2.0'
  'react-dom': '^18.2.0'
```

### Fix Peer Dependency Issues

```yaml
overrides:
  '@types/react': '^18.2.0'
```

### Replace Deprecated Package

```yaml
overrides:
  'request': 'npm:@cypress/request@^3.0.0'
```

## Hooks Alternative

For more complex scenarios, use `.pnpmfile.cjs`:

```js
// .pnpmfile.cjs
function readPackage(pkg, context) {
  // Override dependency version
  if (pkg.dependencies?.lodash) {
    pkg.dependencies.lodash = '^4.17.21'
  }

  // Add missing peer dependency
  if (pkg.name === 'some-package') {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      react: '*',
    }
  }

  return pkg
}

module.exports = {
  hooks: {
    readPackage,
  },
}
```

## Overrides vs Catalogs

| Feature     | Overrides                               | Catalogs                      |
| ----------- | --------------------------------------- | ----------------------------- |
| Affects     | All dependencies (including transitive) | Direct dependencies only      |
| Usage       | Automatic                               | Explicit `catalog:` reference |
| Purpose     | Force versions, fix issues              | Version management            |
| Granularity | Can target specific parents             | Package-wide only             |

## Debugging

Check which version is resolved:

```bash
# See resolved versions
pnpm why lodash

# List all versions
pnpm list lodash --depth=Infinity
```

<!--
Source references:
- https://pnpm.io/package_json#pnpmoverrides
- https://pnpm.io/pnpmfile
-->
