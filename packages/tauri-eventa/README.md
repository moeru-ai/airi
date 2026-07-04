# @proj-airi/tauri-eventa

Shared Eventa contracts for Tauri IPC. Provides `createContext(tauriIpc)` and
`setupTauriEventaContext()` helpers that wrap `window.__TAURI_INTERNALS__.ipc`
into the `IpcRenderer`-like surface expected by `@moeru/eventa`.

## Usage

```ts
import { createContextFromTauriIpc } from '@proj-airi/tauri-eventa'
import { defineInvoke } from '@moeru/eventa'
import { electron } from '@proj-airi/tauri-eventa'

const { context } = createContextFromTauriIpc(window.__TAURI_INTERNALS__)
const getBounds = defineInvoke(context, electron.window.getBounds)
const bounds = await getBounds()
```

## Helpers

- `createContextFromTauriIpc(internals)` — builds an eventa context from a user-supplied
  Tauri internals object (typically `window.__TAURI_INTERNALS__`).
- `setupTauriEventaContext(window?)` — convenience: resolves
  `window.__TAURI_INTERNALS__.ipc` at call time and throws if Tauri is not available.

## Tests

A basic sanity test that verifies `createContext(...).context` returns a non-null context
and emits a console log "eventa context ok: true" when invoked under `cargo tauri dev`.

See `src/index.test.ts` for the Tauri-integration test.
