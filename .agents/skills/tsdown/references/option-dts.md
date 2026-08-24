# TypeScript Declaration Files

Generate `.d.ts` type declaration files for your library.

## Overview

tsdown uses [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts) to generate and bundle TypeScript declaration files.

**Requirements:**
- TypeScript must be installed in your project

## Enabling DTS Generation

### Auto-Enabled

DTS generation is **automatically enabled** if `package.json` contains:
- `types` field, or
- `typings` field

### Manual Enable

#### CLI

```bash
tsdown --dts
```

#### Config File

```ts
export default defineConfig({
  dts: true,
})
```

## Performance

### With `isolatedDeclarations` (Recommended)

**Extremely fast** - uses oxc-transform for generation.

```json
// tsconfig.json
{
  "compilerOptions": {
    "isolatedDeclarations": true
  }
}
```

### Without `isolatedDeclarations`

Falls back to TypeScript compiler. Reliable but slower.

## Declaration Maps

Map `.d.ts` files back to original `.ts` sources (useful for monorepos).

### Enable in tsconfig.json

```json
{
  "compilerOptions": {
    "declarationMap": true
  }
}
```

### Enable in tsdown Config

```ts
export default defineConfig({
  dts: {
    sourcemap: true,
  },
})
```

## Advanced Options

### Custom Compiler Options

Override TypeScript compiler options:

```ts
export default defineConfig({
  dts: {
    compilerOptions: {
      removeComments: false,
    },
  },
})
```

## Build Process

- **ESM format**: `.js` and `.d.ts` files generated in same build
- **CJS format**: Separate build process for `.d.ts` files

## Common Patterns

### Basic Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
})
```

Output:
- `dist/index.mjs`
- `dist/index.cjs`
- `dist/index.d.ts`

### Multiple Entry Points

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    utils: 'src/utils.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
})
```

Output:
- `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`
- `dist/utils.mjs`, `dist/utils.cjs`, `dist/utils.d.ts`

### With Monorepo Support

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    sourcemap: true, // Enable declaration maps
  },
})
```

### Fast Build (Isolated Declarations)

```json
// tsconfig.json
{
  "compilerOptions": {
    "isolatedDeclarations": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

```ts
// tsdown.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true, // Will use fast oxc-transform
})
```

## Troubleshooting

### Missing Types

Ensure TypeScript is installed:

```bash
pnpm add -D typescript
```

### Slow Generation

Enable `isolatedDeclarations` in `tsconfig.json` for faster builds.

### Declaration Errors

Check that all exports have explicit types (required for `isolatedDeclarations`).

### Report Issues

For DTS-specific issues, report to [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts/issues).

### Vue Support

Enable Vue component type generation (requires `vue-tsc`):

```ts
export default defineConfig({
  dts: {
    vue: true,
  },
})
```

### Oxc Transform

Control Oxc usage for declaration generation:

```ts
export default defineConfig({
  dts: {
    oxc: true,  // Use oxc-transform (fast, requires isolatedDeclarations)
  },
})
```

### Custom TSConfig

Specify a different tsconfig for DTS generation:

```ts
export default defineConfig({
  dts: {
    tsconfig: './tsconfig.build.json',
  },
})
```

## Available DTS Options

| Option | Type | Description |
|--------|------|-------------|
| `sourcemap` | `boolean` | Generate declaration source maps |
| `compilerOptions` | `object` | Override TypeScript compiler options |
| `vue` | `boolean` | Enable Vue type generation (requires vue-tsc) |
| `oxc` | `boolean` | Use oxc-transform for fast generation |
| `tsconfig` | `string` | Path to tsconfig file |
| `resolver` | `'oxc' \| 'tsc'` | Module resolver: `'oxc'` (default, fast) or `'tsc'` (more compatible) |
| `cjsDefault` | `boolean` | CJS default export handling |
| `sideEffects` | `boolean` | Preserve side effects in declarations |

## Tips

1. **Always enable DTS** for TypeScript libraries
2. **Use isolatedDeclarations** for fast builds
3. **Enable declaration maps** in monorepos
4. **Ensure explicit types** for all exports
5. **Install TypeScript** as dev dependency

## Related Options

- [Entry](option-entry.md) - Configure entry points
- [Output Format](option-output-format.md) - Multiple output formats
- [Target](option-target.md) - JavaScript version
