# Plugins

Extend tsdown with plugins from multiple ecosystems.

## Overview

tsdown, built on Rolldown, supports plugins from multiple ecosystems to extend and customize the bundling process.

## Supported Ecosystems

### 1. Rolldown Plugins

Native plugins designed for Rolldown:

```ts
import RolldownPlugin from 'rolldown-plugin-something'

export default defineConfig({
  plugins: [RolldownPlugin()],
})
```

**Compatibility:** ✅ Full support

### 2. Unplugin

Universal plugins that work across bundlers:

```ts
import UnpluginPlugin from 'unplugin-something'

export default defineConfig({
  plugins: [UnpluginPlugin.rolldown()],
})
```

**Compatibility:** ✅ Most unplugin-* plugins work

**Examples:**
- `unplugin-vue-components`
- `unplugin-auto-import`
- `unplugin-icons`

### 3. Rollup Plugins

Most Rollup plugins work with tsdown:

```ts
import RollupPlugin from '@rollup/plugin-something'

export default defineConfig({
  plugins: [RollupPlugin()],
})
```

**Compatibility:** ✅ High compatibility

**Type Issues:** May cause TypeScript errors - use type casting:

```ts
import RollupPlugin from 'rollup-plugin-something'

export default defineConfig({
  plugins: [
    // @ts-expect-error Rollup plugin type mismatch
    RollupPlugin(),
    // Or cast to any
    RollupPlugin() as any,
  ],
})
```

### 4. Vite Plugins

Some Vite plugins may work:

```ts
import VitePlugin from 'vite-plugin-something'

export default defineConfig({
  plugins: [
    // @ts-expect-error Vite plugin type mismatch
    VitePlugin(),
  ],
})
```

**Compatibility:** ⚠️ Limited - only if not using Vite-specific APIs

**Note:** Improved support planned for future releases.

## Usage

### Basic Plugin Usage

```ts
import { defineConfig } from 'tsdown'
import SomePlugin from 'some-plugin'

export default defineConfig({
  entry: ['src/index.ts'],
  plugins: [SomePlugin()],
})
```

### Multiple Plugins

```ts
import PluginA from 'plugin-a'
import PluginB from 'plugin-b'
import PluginC from 'plugin-c'

export default defineConfig({
  entry: ['src/index.ts'],
  plugins: [
    PluginA(),
    PluginB({ option: true }),
    PluginC(),
  ],
})
```

### Conditional Plugins

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  plugins: [
    SomePlugin(),
    options.watch && DevPlugin(),
    !options.watch && ProdPlugin(),
  ].filter(Boolean),
}))
```

## Common Plugin Patterns

### JSON Import

```ts
import json from '@rollup/plugin-json'

export default defineConfig({
  plugins: [json()],
})
```

### Node Resolve

```ts
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default defineConfig({
  plugins: [nodeResolve()],
})
```

### CommonJS

```ts
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  plugins: [commonjs()],
})
```

### Replace

```ts
import replace from '@rollup/plugin-replace'

export default defineConfig({
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      __VERSION__: JSON.stringify('1.0.0'),
    }),
  ],
})
```

### Auto Import

```ts
import AutoImport from 'unplugin-auto-import/rolldown'

export default defineConfig({
  plugins: [
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: 'src/auto-imports.d.ts',
    }),
  ],
})
```

### Vue Components

```ts
import Components from 'unplugin-vue-components/rolldown'

export default defineConfig({
  plugins: [
    Components({
      dts: 'src/components.d.ts',
    }),
  ],
})
```

## Framework-Specific Plugins

### React

```ts
import react from '@vitejs/plugin-react'

export default defineConfig({
  entry: ['src/index.tsx'],
  plugins: [
    // @ts-expect-error Vite plugin
    react(),
  ],
})
```

### Vue

```ts
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  entry: ['src/index.ts'],
  plugins: [
    // @ts-expect-error Vite plugin
    vue(),
  ],
})
```

### Solid

```ts
import solid from 'vite-plugin-solid'

export default defineConfig({
  entry: ['src/index.tsx'],
  plugins: [
    // @ts-expect-error Vite plugin
    solid(),
  ],
})
```

### Svelte

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  entry: ['src/index.ts'],
  plugins: [
    // @ts-expect-error Vite plugin
    svelte(),
  ],
})
```

## Writing Custom Plugins

Follow Rolldown's plugin development guide:

### Basic Plugin Structure

```ts
import type { Plugin } from 'rolldown'

function myPlugin(): Plugin {
  return {
    name: 'my-plugin',

    // Transform hook
    transform(code, id) {
      if (id.endsWith('.custom')) {
        return {
          code: transformCode(code),
          map: null,
        }
      }
    },

    // Other hooks...
  }
}
```

### Using Custom Plugin

```ts
import { myPlugin } from './my-plugin'

export default defineConfig({
  plugins: [myPlugin()],
})
```

## Plugin Configuration

### Plugin-Specific Options

Refer to each plugin's documentation for configuration options.

### Plugin Order

Plugins run in the order they're defined:

```ts
export default defineConfig({
  plugins: [
    PluginA(),  // Runs first
    PluginB(),  // Runs second
    PluginC(),  // Runs last
  ],
})
```

## Troubleshooting

### Type Errors with Rollup/Vite Plugins

Use type casting:

```ts
plugins: [
  // Option 1: @ts-expect-error
  // @ts-expect-error Plugin type mismatch
  SomePlugin(),

  // Option 2: as any
  SomePlugin() as any,
]
```

### Plugin Not Working

1. **Check compatibility** - Verify plugin supports your bundler
2. **Read documentation** - Follow plugin's setup instructions
3. **Check plugin order** - Some plugins depend on execution order
4. **Enable debug mode** - Use `--debug` flag

### Vite Plugin Fails

Vite plugins may rely on Vite-specific APIs:

1. **Find Rollup equivalent** - Look for Rollup version of plugin
2. **Use Unplugin version** - Check for `unplugin-*` alternative
3. **Wait for support** - Vite plugin support improving

## Resources

- [Rolldown Plugin Development](https://rolldown.rs/apis/plugin-api)
- [Unplugin Documentation](https://unplugin.unjs.io/)
- [Rollup Plugins](https://github.com/rollup/plugins)
- [Vite Plugins](https://vitejs.dev/plugins/)

## Tips

1. **Prefer Rolldown plugins** for best compatibility
2. **Use Unplugin** for cross-bundler support
3. **Cast types** for Rollup/Vite plugins
4. **Test thoroughly** when using cross-ecosystem plugins
5. **Check plugin docs** for specific configuration
6. **Write custom plugins** for unique needs

## Related

- [Hooks](advanced-hooks.md) - Lifecycle hooks
- [Rolldown Options](advanced-rolldown-options.md) - Advanced Rolldown config
- [React Recipe](recipe-react.md) - React setup with plugins
- [Vue Recipe](recipe-vue.md) - Vue setup with plugins
