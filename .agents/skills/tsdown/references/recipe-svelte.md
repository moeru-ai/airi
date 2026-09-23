# Svelte Support

Build Svelte component libraries with `tsdown` using `rollup-plugin-svelte`.

## Quick Start

```bash
npx create-tsdown@latest -t svelte
```

## Configuration

```ts
import svelte from 'rollup-plugin-svelte'
import { sveltePreprocess } from 'svelte-preprocess'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  platform: 'neutral',
  plugins: [svelte({ preprocess: sveltePreprocess() })],
})
```

## Dependencies

```bash
npm install -D rollup-plugin-svelte svelte svelte-preprocess
```

## Distribution Strategy

**Recommended: Ship `.svelte` source files** instead of precompiled JS. Let consumers' tooling (Vite + `@sveltejs/vite-plugin-svelte`) compile in their apps.

Reasons:
- Avoids version compatibility issues with `svelte/internal`
- Better SSR/hydration consistency
- Consumers get better HMR, diagnostics, and tree-shaking
- Fewer republish cycles on Svelte upgrades

**Exceptions** where shipping JS makes sense:
- Web Components via `customElement` mode
- CDN direct-load without a build step

## Key Points

- Mark `svelte`/`svelte/*` as external; declare `svelte` in `peerDependencies`
- Use `svelte2tsx` to emit `.d.ts` for Svelte components
- Keep `.svelte` in source form for distribution

## Related

- [Plugins](advanced-plugins.md) - Plugin configuration
- [Dependencies](option-dependencies.md) - External dependencies
