# Customizing Rolldown Options

Pass options directly to the underlying Rolldown bundler.

## Overview

tsdown uses [Rolldown](https://rolldown.rs) as its core bundling engine. You can override Rolldown's input and output options directly for fine-grained control.

**Warning:** You should be familiar with Rolldown's behavior before overriding options. Refer to the [Rolldown Config Options](https://rolldown.rs/options/input) documentation.

## Input Options

### Using an Object

```ts
export default defineConfig({
  inputOptions: {
    cwd: './custom-directory',
  },
})
```

### Using a Function

Dynamically modify options based on the output format:

```ts
export default defineConfig({
  inputOptions(inputOptions, format) {
    inputOptions.cwd = './custom-directory'
    return inputOptions
  },
})
```

## Output Options

### Using an Object

```ts
export default defineConfig({
  outputOptions: {
    legalComments: 'inline',
  },
})
```

### Using a Function

```ts
export default defineConfig({
  outputOptions(outputOptions, format) {
    if (format === 'esm') {
      outputOptions.legalComments = 'inline'
    }
    return outputOptions
  },
})
```

## Common Use Cases

### Preserve Legal Comments

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  outputOptions: {
    legalComments: 'inline',
  },
})
```

### Custom Working Directory

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  inputOptions: {
    cwd: './packages/my-lib',
  },
})
```

### Format-Specific Options

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outputOptions(outputOptions, format) {
    if (format === 'esm') {
      outputOptions.legalComments = 'inline'
    }
    return outputOptions
  },
})
```

## When to Use

- When tsdown doesn't expose a specific Rolldown option
- For format-specific Rolldown customizations
- For advanced bundling scenarios

## Tips

1. **Read Rolldown docs** before overriding options
2. **Use functions** for format-specific customization
3. **Test thoroughly** when overriding defaults
4. **Prefer tsdown options** when available (e.g., use `minify` instead of setting it via `outputOptions`)

## Related

- [Plugins](advanced-plugins.md) - Plugin system
- [Hooks](advanced-hooks.md) - Lifecycle hooks
- [Config File](option-config-file.md) - Configuration options
