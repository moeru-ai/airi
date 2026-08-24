# Solid Support

Build Solid component libraries with `tsdown` using `unplugin-solid`.

## Quick Start

```bash
npx create-tsdown@latest -t solid
```

## Configuration

```ts
import solid from 'unplugin-solid/rolldown'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  platform: 'neutral',
  dts: true,
  plugins: [solid()],
})
```

## Dependencies

Install `unplugin-solid`:

```bash
npm install -D unplugin-solid
```

## Key Points

- Use `platform: 'neutral'` for framework-agnostic output
- `dts: true` generates TypeScript declarations
- The Solid plugin handles JSX compilation for Solid's reactive system

## Related

- [Plugins](advanced-plugins.md) - Plugin configuration
- [Platform](option-platform.md) - Platform options
