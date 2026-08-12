# tsdown Skills

Agent skills that help AI coding agents understand and work with [tsdown](https://tsdown.dev), the elegant library bundler.

## Installation

```bash
npx skills add rolldown/tsdown
```

This will install all tsdown skills (including the migration skill). To install only the tsdown skill:

```bash
npx skills add rolldown/tsdown --skill tsdown
```

## What's Included

The tsdown skill provides Claude Code with knowledge about:

- **Core Concepts** - What tsdown is, why use it, key features
- **Configuration** - Config file formats, options, multiple configs, workspace support
- **Build Options** - Entry points, output formats, type declarations, targets
- **Dependency Handling** - External/inline dependencies, auto-externalization
- **Output Enhancement** - Shims, CJS defaults, package exports
- **Framework Support** - React, Vue, Solid, Svelte integration
- **Advanced Features** - Plugins, hooks, programmatic API, Rolldown options
- **CLI Commands** - All CLI options and usage patterns
- **Migration** - Migrating from tsup to tsdown

## Usage

Once installed, Claude Code will automatically use tsdown knowledge when:

- Building TypeScript/JavaScript libraries
- Configuring bundlers for library projects
- Setting up type declaration generation
- Working with multi-format builds (ESM, CJS, IIFE, UMD)
- Migrating from tsup
- Building framework component libraries

### Example Prompts

```
Set up tsdown to build my TypeScript library with ESM and CJS formats
```

```
Configure tsdown to generate type declarations and bundle for browsers
```

```
Add React support to my tsdown config with Fast Refresh
```

```
Help me migrate from tsup to tsdown
```

```
Set up a monorepo build with tsdown workspace support
```

## Related Skills

- **[tsdown-migrate](https://github.com/rolldown/tsdown/tree/main/skills/tsdown-migrate)** - Dedicated skill for migrating from tsup to tsdown, with complete option mappings, config transformations, and troubleshooting guidance.

## Documentation

- [tsdown Documentation](https://tsdown.dev)
- [GitHub Repository](https://github.com/rolldown/tsdown)
- [Rolldown](https://rolldown.rs)
- [Migration Guide](https://tsdown.dev/guide/migrate-from-tsup)

## License

MIT
