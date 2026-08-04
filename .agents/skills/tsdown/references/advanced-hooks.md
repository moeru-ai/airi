# Lifecycle Hooks

Extend the build process with lifecycle hooks.

## Overview

Hooks provide a way to inject custom logic at specific stages of the build lifecycle. Inspired by [unbuild](https://github.com/unjs/unbuild).

**Recommendation:** Use [plugins](advanced-plugins.md) for most extensions. Use hooks for simple custom tasks or Rolldown plugin injection.

## Usage Patterns

### Object Syntax

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  hooks: {
    'build:prepare': async (context) => {
      console.log('Build starting...')
    },
    'build:done': async (context) => {
      console.log('Build complete!')
    },
  },
})
```

### Function Syntax

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  hooks(hooks) {
    hooks.hook('build:prepare', () => {
      console.log('Preparing build...')
    })

    hooks.hook('build:before', (context) => {
      console.log(`Building format: ${context.format}`)
    })
  },
})
```

## Available Hooks

### `build:prepare`

Called before the build process starts.

**When:** Once per build session

**Context:**
```ts
{
  options: ResolvedConfig,
  hooks: Hookable
}
```

**Use cases:**
- Setup tasks
- Validation
- Environment preparation

**Example:**
```ts
hooks: {
  'build:prepare': async (context) => {
    console.log('Starting build for:', context.options.entry)
    await cleanOldFiles()
  },
}
```

### `build:before`

Called before each Rolldown build.

**When:** Once per format (ESM, CJS, etc.)

**Context:**
```ts
{
  options: ResolvedConfig,
  buildOptions: BuildOptions,
  hooks: Hookable
}
```

**Use cases:**
- Modify build options per format
- Inject plugins dynamically
- Format-specific setup

**Example:**
```ts
hooks: {
  'build:before': async (context) => {
    console.log(`Building ${context.buildOptions.format} format...`)

    // Add format-specific plugin
    if (context.buildOptions.format === 'iife') {
      context.buildOptions.plugins.push(browserPlugin())
    }
  },
}
```

### `build:done`

Called after the build completes.

**When:** Once per build session

**Context:**
```ts
{
  options: ResolvedConfig,
  chunks: RolldownChunk[],
  hooks: Hookable
}
```

**Use cases:**
- Post-processing
- Asset copying
- Notifications
- Deployment

**Example:**
```ts
hooks: {
  'build:done': async (context) => {
    console.log(`Built ${context.chunks.length} chunks`)

    // Copy additional files
    await copyAssets()

    // Send notification
    notifyBuildComplete()
  },
}
```

## Common Patterns

### Build Notifications

```ts
export default defineConfig({
  hooks: {
    'build:prepare': () => {
      console.log('🚀 Starting build...')
    },
    'build:done': (context) => {
      const size = context.chunks.reduce((sum, c) => sum + c.code.length, 0)
      console.log(`✅ Build complete! Total size: ${size} bytes`)
    },
  },
})
```

### Conditional Plugin Injection

```ts
export default defineConfig({
  hooks(hooks) {
    hooks.hook('build:before', (context) => {
      // Add minification only for production
      if (process.env.NODE_ENV === 'production') {
        context.buildOptions.plugins.push(minifyPlugin())
      }
    })
  },
})
```

### Custom File Copy

```ts
import { copyFile } from 'fs/promises'

export default defineConfig({
  hooks: {
    'build:done': async (context) => {
      // Copy README to dist
      await copyFile('README.md', `${context.options.outDir}/README.md`)
    },
  },
})
```

### Build Metrics

```ts
export default defineConfig({
  hooks: {
    'build:prepare': (context) => {
      context.startTime = Date.now()
    },
    'build:done': (context) => {
      const duration = Date.now() - context.startTime
      console.log(`Build took ${duration}ms`)

      // Log chunk sizes
      context.chunks.forEach((chunk) => {
        console.log(`${chunk.fileName}: ${chunk.code.length} bytes`)
      })
    },
  },
})
```

### Format-Specific Logic

```ts
export default defineConfig({
  format: ['esm', 'cjs', 'iife'],
  hooks: {
    'build:before': (context) => {
      const format = context.buildOptions.format

      if (format === 'iife') {
        // Browser-specific setup
        context.buildOptions.globalName = 'MyLib'
      } else if (format === 'cjs') {
        // Node-specific setup
        context.buildOptions.platform = 'node'
      }
    },
  },
})
```

### Deployment Hook

```ts
export default defineConfig({
  hooks: {
    'build:done': async (context) => {
      if (process.env.DEPLOY === 'true') {
        console.log('Deploying to CDN...')
        await deployToCDN(context.options.outDir)
      }
    },
  },
})
```

## Advanced Usage

### Multiple Hooks

```ts
export default defineConfig({
  hooks(hooks) {
    // Register multiple hooks
    hooks.hook('build:prepare', setupEnvironment)
    hooks.hook('build:prepare', validateConfig)

    hooks.hook('build:before', injectPlugins)
    hooks.hook('build:before', logFormat)

    hooks.hook('build:done', generateManifest)
    hooks.hook('build:done', notifyComplete)
  },
})
```

### Async Hooks

```ts
export default defineConfig({
  hooks: {
    'build:prepare': async (context) => {
      await fetchRemoteConfig()
      await initializeDatabase()
    },
    'build:done': async (context) => {
      await uploadToS3(context.chunks)
      await invalidateCDN()
    },
  },
})
```

### Error Handling

```ts
export default defineConfig({
  hooks: {
    'build:done': async (context) => {
      try {
        await riskyOperation()
      } catch (error) {
        console.error('Hook failed:', error)
        // Don't throw - allow build to complete
      }
    },
  },
})
```

## Hookable API

tsdown uses [hookable](https://github.com/unjs/hookable) for hooks. Additional methods:

```ts
export default defineConfig({
  hooks(hooks) {
    // Register hook
    hooks.hook('build:done', handler)

    // Register hook once
    hooks.hookOnce('build:prepare', handler)

    // Remove hook
    hooks.removeHook('build:done', handler)

    // Clear all hooks for event
    hooks.removeHooks('build:done')

    // Call hooks manually
    await hooks.callHook('build:done', context)
  },
})
```

## Tips

1. **Use plugins** for most extensions
2. **Hooks for simple tasks** like notifications or file copying
3. **Async hooks supported** for I/O operations
4. **Don't throw errors** unless you want to fail the build
5. **Context is mutable** in `build:before` for advanced use cases
6. **Multiple hooks allowed** for the same event

## Troubleshooting

### Hook Not Called

- Verify hook name is correct
- Check hook is registered in config
- Ensure async hooks are awaited

### Build Fails in Hook

- Add try/catch for error handling
- Don't throw unless intentional
- Log errors for debugging

### Context Undefined

- Check which hook you're using
- Verify context properties available for that hook

## Related

- [Plugins](advanced-plugins.md) - Plugin system
- [Rolldown Options](advanced-rolldown-options.md) - Build options
- [Watch Mode](option-watch-mode.md) - Development workflow
