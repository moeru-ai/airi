# Vishot Runtime

Shared runtime contracts and Vue bindings for Vishot scene capture.

## Purpose

This package owns the browser-side runtime surface used by scene packages. It provides:

- readiness helpers via `markScenarioReady()` and `resetScenarioReady()`
- the shared `ScenarioCaptureRootProps` type
- framework-specific bindings through subpath exports such as `@proj-airi/vishot-runtime/vue`

## Usage

```ts
import { markScenarioReady, resetScenarioReady } from '@proj-airi/vishot-runtime'
import { ScenarioCanvas, ScenarioCaptureRoot } from '@proj-airi/vishot-runtime/vue'
```

Keep framework-agnostic contracts at the package root and import Vue SFC bindings from `./vue`.

```ts
import {
  markScenarioReady,
  resetScenarioReady,
} from '@proj-airi/vishot-runtime'
```
