# Introduction

**tsdown** is _The Elegant Library Bundler_ — a fast, simple bundler for TypeScript and JavaScript libraries powered by Rolldown (Rust-based).

## Why tsdown?

Built on [Rolldown](https://rolldown.rs), tsdown provides a complete out-of-the-box solution for library authors:

- **Simplified Configuration**: Sensible defaults for library development, minimal boilerplate
- **Library-Specific Features**: Auto TypeScript declarations, multiple output formats, package validation
- **Future-Ready**: Official Rolldown project, foundation for Rolldown Vite's Library Mode

## Plugin Ecosystem

Supports the full Rolldown plugin ecosystem plus most Rollup plugins. See [Plugins](advanced-plugins.md).

## What Can It Bundle?

- **TypeScript/JavaScript**: `.ts`, `.js` with modern syntax
- **TypeScript Declarations**: Auto-generate `.d.ts` files
- **Multiple Formats**: `esm`, `cjs`, `iife`, `umd`
- **Assets**: `.json`, `.wasm`, CSS files
- Built-in tree shaking, minification, and source maps

## Key Differences from Rolldown

tsdown wraps Rolldown with library-specific features:
- Auto-external `dependencies`, `peerDependencies`, and `optionalDependencies` from `package.json`
- DTS generation
- `package.json` exports field generation
- Watch mode with keyboard shortcuts
- CSS preprocessing pipeline
- Executable bundling (SEA)

## Prior Arts

Inspired by: Rollup, esbuild, tsup, unbuild. Powered by Rolldown.

## Related

- [Getting Started](guide-getting-started.md) - Installation and first build
- [Migrate from tsup](guide-migrate-from-tsup.md) - Migration guide
