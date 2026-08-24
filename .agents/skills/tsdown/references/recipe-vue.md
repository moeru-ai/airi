# Vue Support

Build Vue component libraries with tsdown.

## Overview

tsdown provides first-class support for Vue libraries through integration with `unplugin-vue` and `rolldown-plugin-dts` for type generation.

## Quick Start

### Use Starter Template

```bash
npx create-tsdown@latest -t vue
```

## Basic Configuration

### Install Dependencies

```bash
pnpm add -D unplugin-vue vue-tsc
```

### Minimal Setup

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'
import Vue from 'unplugin-vue/rolldown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [
    Vue({ isProduction: true }),
  ],
  dts: {
    vue: true,  // Enable Vue type generation
  },
})
```

## How It Works

### unplugin-vue

Compiles `.vue` single-file components:
- Transforms template to render functions
- Handles scoped styles
- Processes script setup

### vue-tsc

Generates TypeScript declarations:
- Type-checks Vue components
- Creates `.d.ts` files
- Preserves component props types
- Exports component types

## Component Example

### Single File Component

```vue
<!-- src/Button.vue -->
<script setup lang="ts">
interface Props {
  type?: 'primary' | 'secondary'
  disabled?: boolean
}

defineProps<Props>()
defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :class="['btn', `btn-${type}`]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  padding: 8px 16px;
  border-radius: 4px;
}

.btn-primary {
  background: blue;
  color: white;
}
</style>
```

### Export Components

```ts
// src/index.ts
export { default as Button } from './Button.vue'
export { default as Input } from './Input.vue'
export { default as Modal } from './Modal.vue'

// Re-export types
export type { ButtonProps } from './Button.vue'
```

## Common Patterns

### Component Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [
    Vue({
      isProduction: true,
      style: {
        trim: true,
      },
    }),
  ],
  dts: {
    vue: true,
  },
  clean: true,
})
```

### Multiple Components

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    Button: 'src/Button.vue',
    Input: 'src/Input.vue',
    Modal: 'src/Modal.vue',
  },
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [Vue({ isProduction: true })],
  dts: { vue: true },
})
```

### With Composition Utilities

```ts
// src/composables/useCounter.ts
import { ref } from 'vue'

export function useCounter(initial = 0) {
  const count = ref(initial)
  const increment = () => count.value++
  const decrement = () => count.value--
  return { count, increment, decrement }
}
```

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [Vue({ isProduction: true })],
  dts: { vue: true },
})
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "isolatedDeclarations": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Package.json Configuration

```json
{
  "name": "my-vue-library",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
  },
  "files": ["dist"],
  "peerDependencies": {
    "vue": "^3.0.0"
  },
  "devDependencies": {
    "tsdown": "^0.9.0",
    "typescript": "^5.0.0",
    "unplugin-vue": "^5.0.0",
    "vue": "^3.4.0",
    "vue-tsc": "^2.0.0"
  }
}
```

## Advanced Patterns

### With Vite Plugins

Some Vite Vue plugins may work:

```ts
import Vue from 'unplugin-vue/rolldown'
import Components from 'unplugin-vue-components/rolldown'

export default defineConfig({
  entry: ['src/index.ts'],
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [
    Vue({ isProduction: true }),
    Components({
      dts: 'src/components.d.ts',
    }),
  ],
  dts: { vue: true },
})
```

### JSX Support

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['vue'],
  },
  plugins: [
    Vue({
      isProduction: true,
      script: {
        propsDestructure: true,
      },
    }),
  ],
  inputOptions: {
    transform: {
      jsx: 'automatic',
      jsxImportSource: 'vue',
    },
  },
  dts: { vue: true },
})
```

### Monorepo Vue Packages

```ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['vue', /^@mycompany\//],
  },
  plugins: [Vue({ isProduction: true })],
  dts: { vue: true },
})
```

## Plugin Options

### unplugin-vue Options

```ts
Vue({
  isProduction: true,
  script: {
    defineModel: true,
    propsDestructure: true,
  },
  style: {
    trim: true,
  },
  template: {
    compilerOptions: {
      isCustomElement: (tag) => tag.startsWith('custom-'),
    },
  },
})
```

## Tips

1. **Always externalize Vue** - Don't bundle Vue itself
2. **Enable vue: true in dts** - For proper type generation
3. **Use platform: 'neutral'** - Maximum compatibility
4. **Install vue-tsc** - Required for type generation
5. **Set isProduction: true** - Optimize for production
6. **Add peer dependency** - Vue as peer dependency

## Troubleshooting

### Type Generation Fails

Ensure vue-tsc is installed:
```bash
pnpm add -D vue-tsc
```

Enable in config:
```ts
dts: { vue: true }
```

### Component Types Missing

Check TypeScript config:
```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "moduleResolution": "bundler"
  }
}
```

### Vue Not Externalized

Add to deps.neverBundle:
```ts
deps: {
  neverBundle: ['vue'],
}
```

### SFC Compilation Errors

Check unplugin-vue version:
```bash
pnpm add -D unplugin-vue@latest
```

## Related

- [Plugins](advanced-plugins.md) - Plugin system
- [Dependencies](option-dependencies.md) - External packages
- [DTS](option-dts.md) - Type declarations
- [React Recipe](recipe-react.md) - React component libraries
