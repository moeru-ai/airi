# AIRI Screenshot

Project-specific screenshot orchestration for the AIRI monorepo.

## Purpose

This package owns AIRI-specific screenshot knowledge:

- workspace paths and default output directories
- named presets for AIRI screenshot scenarios
- target-level commands for AIRI surfaces such as `stage-tamagotchi`
- future GitHub slash-command wiring for PR screenshot previews

It does not own generic screenshot capture primitives. Keep reusable browser,
Electron, Histoire, readiness, and artifact logic in the `vishot-*` packages so
those packages remain publishable without AIRI-specific behavior.

## Usage

From the repository root:

```bash
pnpm -F @proj-airi/airi-screenshot capture tamagotchi --scenario settings-connection --output-dir .vishot/pr-123
```

Use an explicit scenario path when no preset exists:

```bash
pnpm -F @proj-airi/airi-screenshot capture tamagotchi --scenario packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts --output-dir .vishot/hearing --format avif
```

The CLI currently supports:

- target: `tamagotchi`
- formats: `png`, `avif`
- presets: `settings-connection`, `demo-hearing-dialog`

## Boundary

Use this package when the command needs AIRI product knowledge. Use the
underlying `@proj-airi/vishot-runner-*` packages directly when authoring or
testing generic screenshot capture behavior.
