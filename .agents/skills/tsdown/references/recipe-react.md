# React Support

Build React component libraries with tsdown.

## Overview

tsdown provides first-class support for React libraries. Rolldown natively supports JSX/TSX, so no additional plugins are required for basic React components.

## Quick Start

### Use Starter Template

```bash
# Basic React library
npx create-tsdown@latest -t react

# With React Compiler
npx create-tsdown@latest -t react-compiler
```

## Basic Configuration

### Minimal Setup

```ts
// tsdown.config.ts
export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
  dts: true,
})
```

### Component Example

```tsx
// src/MyButton.tsx
import React from 'react'

interface MyButtonProps {
  type?: 'primary' | 'secondary'
  onClick?: () => void
}

export const MyButton: React.FC<MyButtonProps> = ({ type = 'primary', onClick }) => {
  return (
    <button className={`btn btn-${type}`} onClick={onClick}>
      Click me
    </button>
  )
}
```

```ts
// src/index.ts
export { MyButton } from './MyButton'
```

## JSX Transform

### Automatic (Default)

Modern JSX transform (React 17+):

```ts
export default defineConfig({
  entry: ['src/index.tsx'],
  // Automatic JSX is default
})
```

**Characteristics:**
- No `import React` needed
- Smaller bundle size
- React 17+ required

### Classic

Legacy JSX transform:

```ts
export default defineConfig({
  entry: ['src/index.tsx'],
  inputOptions: {
    transform: {
      jsx: 'react',  // Classic transform
    },
  },
})
```

**Characteristics:**
- Requires `import React from 'react'`
- Compatible with older React versions

## React Compiler

React Compiler automatically optimizes React code at build time.

### Install Dependencies

```bash
pnpm add -D @rollup/plugin-babel babel-plugin-react-compiler
```

### Configure

```ts
import pluginBabel from '@rollup/plugin-babel'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
  plugins: [
    pluginBabel({
      babelHelpers: 'bundled',
      parserOpts: {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      },
      plugins: ['babel-plugin-react-compiler'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    }),
  ],
  dts: true,
})
```

## Common Patterns

### Component Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      /^react\//,  // react/jsx-runtime, etc.
    ],
  },
  dts: true,
  clean: true,
})
```

### Multiple Components

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    Button: 'src/Button.tsx',
    Input: 'src/Input.tsx',
    Modal: 'src/Modal.tsx',
  },
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
  dts: true,
})
```

### Hooks Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  deps: {
    neverBundle: ['react'],  // Only React needed
  },
  dts: true,
  treeshake: true,
})
```

### Monorepo React Packages

```ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      /^@mycompany\//,  // Other workspace packages
    ],
  },
  dts: true,
})
```

## TypeScript Configuration

### Recommended tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",  // or "react" for classic
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "isolatedDeclarations": true,  // Fast DTS generation
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

## Package.json Configuration

```json
{
  "name": "my-react-library",
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
    }
  },
  "files": ["dist"],
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tsdown": "^0.9.0",
    "typescript": "^5.0.0"
  }
}
```

## Advanced Patterns

### With Fast Refresh (Development)

```ts
import react from '@vitejs/plugin-react'

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
  plugins: options.watch
    ? [
        // @ts-expect-error Vite plugin
        react({ fastRefresh: true }),
      ]
    : [],
}))
```

## Tips

1. **Always externalize React** - Don't bundle React/ReactDOM
2. **Use automatic JSX** - Smaller bundles with React 17+
3. **Enable DTS generation** - TypeScript support essential
4. **Use platform: 'neutral'** - For maximum compatibility
5. **Add peer dependencies** - Let users provide React
6. **Enable tree shaking** - Reduce bundle size
7. **Use React Compiler** - Better runtime performance

## Troubleshooting

### React Hook Errors

Ensure React is externalized:

```ts
deps: {
  neverBundle: ['react', 'react-dom', /^react\//],
}
```

### Type Errors with JSX

Check `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx"  // or "react"
  }
}
```

### Duplicate React

Add to deps.neverBundle:

```ts
deps: {
  neverBundle: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ],
}
```

## Related

- [Plugins](advanced-plugins.md) - Extend functionality
- [Dependencies](option-dependencies.md) - External packages
- [DTS](option-dts.md) - Type declarations
- [Vue Recipe](recipe-vue.md) - Vue component libraries
