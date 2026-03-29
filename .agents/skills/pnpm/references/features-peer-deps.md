---
name: pnpm-peer-dependencies
description: Handling peer dependencies with auto-install and resolution rules
---

# pnpm Peer Dependencies

pnpm has strict peer dependency handling by default. It provides configuration options to control how peer dependencies are resolved and reported.

## Auto-Install Peer Dependencies

By default, pnpm automatically installs peer dependencies:

```ini
# .npmrc (default is true since pnpm v8)
auto-install-peers=true
```

When enabled, pnpm automatically adds missing peer dependencies based on the best matching version.

## Strict Peer Dependencies

Control whether peer dependency issues cause errors:

```ini
# Fail on peer dependency issues (default: false)
strict-peer-dependencies=true
```

When strict, pnpm will fail if:
- Peer dependency is missing
- Installed version doesn't match required range

## Peer Dependency Rules

Configure peer dependency behavior in `package.json`:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": ["@babel/*", "eslint"],
      "allowedVersions": {
        "react": "17 || 18"
      },
      "allowAny": ["@types/*"]
    }
  }
}
```

### ignoreMissing

Suppress warnings for missing peer dependencies:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": [
        "@babel/*",
        "eslint",
        "webpack"
      ]
    }
  }
}
```

Use patterns:
- `"react"` - exact package name
- `"@babel/*"` - all packages in scope
- `"*"` - all packages (not recommended)

### allowedVersions

Allow specific versions that would otherwise cause warnings:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowedVersions": {
        "react": "17 || 18",
        "webpack": "4 || 5",
        "@types/react": "*"
      }
    }
  }
}
```

### allowAny

Allow any version for specified peer dependencies:

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowAny": ["@types/*", "eslint"]
    }
  }
}
```

## Adding Peer Dependencies via Hooks

Use `.pnpmfile.cjs` to add missing peer dependencies:

```js
// .pnpmfile.cjs
function readPackage(pkg, context) {
  // Add missing peer dependency
  if (pkg.name === 'problematic-package') {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      react: '*'
    }
  }
  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
```

## Peer Dependencies in Workspaces

Workspace packages can satisfy peer dependencies:

```json
// packages/app/package.json
{
  "dependencies": {
    "react": "^18.2.0",
    "@myorg/components": "workspace:^"
  }
}

// packages/components/package.json
{
  "peerDependencies": {
    "react": "^17.0.0 || ^18.0.0"
  }
}
```

The workspace `app` provides `react` which satisfies `components`' peer dependency.

## Common Scenarios

### Monorepo with Shared React

```yaml
# pnpm-workspace.yaml
catalog:
  react: ^18.2.0
  react-dom: ^18.2.0
```

```json
// packages/ui/package.json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}

// apps/web/package.json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
    "@myorg/ui": "workspace:^"
  }
}
```

### Suppress ESLint Plugin Warnings

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": [
        "eslint",
        "@typescript-eslint/parser"
      ]
    }
  }
}
```

### Allow Multiple Major Versions

```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowedVersions": {
        "webpack": "4 || 5",
        "postcss": "7 || 8"
      }
    }
  }
}
```

## Debugging Peer Dependencies

```bash
# See why a package is installed
pnpm why <package>

# List all peer dependency warnings
pnpm install --reporter=append-only 2>&1 | grep -i peer

# Check dependency tree
pnpm list --depth=Infinity
```

## Best Practices

1. **Enable auto-install-peers** for convenience (default in pnpm v8+)

2. **Use peerDependencyRules** instead of ignoring all warnings

3. **Document suppressed warnings** explaining why they're safe

4. **Keep peer deps ranges wide** in libraries:
   ```json
   {
     "peerDependencies": {
       "react": "^17.0.0 || ^18.0.0"
     }
   }
   ```

5. **Test with different peer versions** if you support multiple majors

<!--
Source references:
- https://pnpm.io/package_json#pnpmpeerdependencyrules
- https://pnpm.io/npmrc#auto-install-peers
-->
