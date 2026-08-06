# tsdown Skill References

This directory contains detailed reference documentation for the tsdown skill.

## Created Files (35 total)

### Core Guides (3)
- ✅ `guide-getting-started.md` - Installation, first bundle, CLI basics
- ✅ `guide-migrate-from-tsup.md` - Migration guide from tsup
- ✅ `guide-introduction.md` - Introduction and key features

### Configuration Options (20)
- ✅ `option-config-file.md` - Config file formats, loaders, workspace
- ✅ `option-entry.md` - Entry point configuration with globs
- ✅ `option-output-format.md` - Output formats (ESM, CJS, IIFE, UMD)
- ✅ `option-output-directory.md` - Output directory and extensions
- ✅ `option-dts.md` - TypeScript declaration generation
- ✅ `option-target.md` - Target environment (ES2020, ESNext, etc.)
- ✅ `option-platform.md` - Platform (node, browser, neutral)
- ✅ `option-dependencies.md` - External and inline dependencies
- ✅ `option-sourcemap.md` - Source map generation
- ✅ `option-minification.md` - Minification (`boolean | 'dce-only' | MinifyOptions`)
- ✅ `option-tree-shaking.md` - Tree shaking configuration
- ✅ `option-cleaning.md` - Output directory cleaning
- ✅ `option-watch-mode.md` - Watch mode configuration
- ✅ `option-shims.md` - ESM/CJS compatibility shims
- ✅ `option-package-exports.md` - Auto-generate package.json exports
- ✅ `option-css.md` - CSS handling (experimental, full pipeline: preprocessors, Lightning CSS, PostCSS, code splitting)
- ✅ `option-unbundle.md` - Preserve directory structure
- ✅ `option-cjs-default.md` - CommonJS default export handling
- ✅ `option-log-level.md` - Logging configuration
- ✅ `option-lint.md` - Package validation (publint & attw)

### Executable (1)
- ✅ `option-exe.md` - Standalone executable bundling (Node.js SEA)

### Advanced Topics (6)
- ✅ `advanced-plugins.md` - Rolldown, Rollup, Unplugin support
- ✅ `advanced-hooks.md` - Lifecycle hooks system
- ✅ `advanced-programmatic.md` - Node.js API usage
- ✅ `advanced-rolldown-options.md` - Pass options to Rolldown
- ✅ `advanced-ci.md` - CI environment detection and CI-aware options

### Advanced (continued)
- ✅ `advanced-benchmark.md` - Performance benchmarks

### Framework Recipes (5)
- ✅ `recipe-react.md` - React library setup with JSX
- ✅ `recipe-vue.md` - Vue library setup with SFC
- ✅ `recipe-solid.md` - Solid.js library setup
- ✅ `recipe-svelte.md` - Svelte component libraries
- ✅ `recipe-wasm.md` - WASM module support

### Reference (1)
- ✅ `reference-cli.md` - Complete CLI command reference

## Coverage Status

**Created:** 35 files (100% complete)

## Current Skill Features

The tsdown skill now includes comprehensive coverage of:

### ✅ Core Functionality
- Getting started and installation
- Entry points and glob patterns
- Output formats (ESM, CJS, IIFE, UMD)
- TypeScript declarations
- Configuration file setup
- CLI reference

### ✅ Build Options
- Target environment configuration
- Platform selection
- Dependency management
- Source maps
- Minification
- Tree shaking
- Output cleaning
- Watch mode

### ✅ Advanced Features
- Plugins (Rolldown, Rollup, Unplugin)
- Lifecycle hooks
- ESM/CJS shims
- Package exports generation
- Package validation (publint, attw)
- Programmatic API (Node.js)
- Output directory customization
- CSS handling and modules
- Unbundle mode
- CI environment detection and CI-aware options

### ✅ Framework & Runtime Support
- React with JSX/TSX
- React Compiler integration
- Vue with SFC support
- Vue type generation (vue-tsc)
- WASM module bundling (rolldown-plugin-wasm)

### ✅ Migration
- Complete migration guide from tsup
- Compatibility notes

## Usage

The skill is now ready for use with comprehensive coverage of core features. Additional files can be added incrementally as needed.

## File Naming Convention

Files are prefixed by category:
- `guide-*` - Getting started guides and tutorials
- `option-*` - Configuration options
- `advanced-*` - Advanced topics (plugins, hooks, programmatic API)
- `recipe-*` - Framework-specific recipes
- `reference-*` - CLI and API reference

## Creating New Reference Files

When creating new reference files:

1. **Read source documentation** from `/docs` directory
2. **Simplify for AI consumption** - concise, actionable content
3. **Include code examples** - practical, copy-paste ready
4. **Add cross-references** - link to related options
5. **Follow naming convention** - use appropriate prefix
6. **Keep it focused** - one topic per file

## Updating Existing Files

When documentation changes:

1. Check git diff: `git diff <sha>..HEAD -- docs/`
2. Update affected reference files
3. Update SKILL.md if needed
4. Update GENERATION.md with new SHA

See `skills/GENERATION.md` for detailed update instructions.
