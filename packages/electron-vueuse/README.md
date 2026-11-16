# @proj-airi/electron-vueuse

VueUse-like composables and helpers shared across AIRI Electron apps.

## What it provides

- Renderer composables for common Electron behaviors (`mouse`, `window bounds`, `auto updater`, etc.)
- A reusable Eventa context/invoke pattern (`useElectronEventaContext`, `useElectronEventaInvoke`)
- Eventa context/invoke ergonomics for renderer code
- Main-process loop utilities (`useLoop`, `createRendererLoop`)
- Main-process cleanup on window close (`onWindowClosed`). All callbacks of one window share one `closed` listener, so the window stays below the listener limit of Node.

For IPC contract definitions, use `@proj-airi/electron-eventa`.

## Usage

```ts
import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'

const openSettings = useElectronEventaInvoke(electron.window.getBounds)
```

```ts
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'
```

In the main process, register each cleanup that a window close starts with `onWindowClosed`. Do not add a `closed` listener to the window directly.

```ts
import { onWindowClosed } from '@proj-airi/electron-vueuse/main'
import { powerMonitor } from 'electron'

powerMonitor.on('resume', onResume)
onWindowClosed(window, () => powerMonitor.off('resume', onResume))
```
