# @proj-airi/native-window-win32

Node-API bindings (built with [`napi-rs`](https://napi.rs/)) that read the Win32 window data for the dock mode of AIRI.

## What it does

- Lists top-level windows in z-order.
- Reads the rect, the visible and minimized flags, `GWL_EXSTYLE`, the owner PID, the title, and the DWM cloaked state of each window.
- Returns window IDs in the `win32:<hwndHex>` format that the overlay logic uses.
- Walks the z-order with `GetWindow`. If a walk fails, visits a window two times, or passes 65,536 steps, the binding uses `EnumWindows` instead.

| Function | Result |
| --- | --- |
| `listWindows(options?)` | The top-level windows in z-order. |
| `getWindow(id, options?)` | One window, or `null`. |
| `getWindowsAbove(id, options?)` | The windows above the window `id` in z-order. |
| `getForegroundWindow(options?)` | The foreground window, or `null`. |

All functions skip tool windows (`WS_EX_TOOLWINDOW`), no-activate windows (`WS_EX_NOACTIVATE`), and windows with an empty rect.

`options` has `includeTitle` and `includeOwnerPid`. Both are `true` by default.

## How to use

Load the binding only on Windows. Catch the load error, because an install can have no binding (see [Build](#build)).

```ts
import process from 'node:process'

async function loadBinding() {
  if (process.platform !== 'win32')
    return undefined

  try {
    return await import('@proj-airi/native-window-win32')
  }
  catch {
    // The binding was not built. Use a different window tracker.
    return undefined
  }
}

const binding = await loadBinding()
if (binding)
  console.info(binding.listWindows({ includeTitle: false }).length)
```

`@proj-airi/electron-window-dock` uses the same checks. If the load fails, it logs a warning and uses the Electron-only window tracker.

## When to use

- Use it in the Electron main process on Windows. It gives the z-order, the owner PID, and the cloaked state of windows from other apps. Electron has no API for this data.

## When not to use

- Do not use it on macOS or Linux. The `build` script makes a binding only on Windows.
- Do not load it in a renderer or in a browser. It is a Node-API module.
- Do not make a feature require it. An install without Rust has no binding, so keep a fallback path.

## Build

The `build` script (`scripts/build-if-win32.mjs`) does the native build only on Windows:

| Host | Result of `build` |
| --- | --- |
| Not Windows | Skips the build and exits with success. |
| Windows, `cargo --version` fails | Writes a warning, skips the build, and exits with success. |
| Windows, `cargo --version` fails, `AIRI_REQUIRE_NATIVE_WINDOW_WIN32=1` | Exits with an error. |
| Windows, `cargo --version` succeeds | Runs `napi build --platform --release --js false`. If that command fails, exits with an error. |

On Windows, `pnpm install` runs `build`. The root `postinstall` runs `build:packages`, which runs `turbo run build` for each package. Turbo does not cache this task.

To build the binding, install Rust so that `cargo` is on PATH. If `CARGO` is set, the script and the napi CLI use that command instead.

By default, Turbo 2 runs a task in strict environment mode. Then the task gets only the variables that `turbo.json` lists, and a set of default variables. For this task, `turbo.json` lists `AIRI_REQUIRE_NATIVE_WINDOW_WIN32`, `CARGO`, `CARGO_HOME`, `RUSTUP_HOME`, and `RUSTUP_TOOLCHAIN`.

A CI or release job can set `AIRI_REQUIRE_NATIVE_WINDOW_WIN32=1` to make a missing Cargo an error. The current release workflows in `.github/workflows` do not set it. Thus a release build without Cargo has no binding, and Dock Mode uses the Electron-only fallback.

```bash
pnpm -F @proj-airi/native-window-win32 build         # Builds on Windows. Skips on other platforms.
pnpm -F @proj-airi/native-window-win32 build:native  # Always runs `napi build --platform --release`.
pnpm -F @proj-airi/native-window-win32 build:debug   # Always runs `napi build --platform`.
```

### Generated files

The napi CLI generates `index.js` (the loader) and `index.d.ts` (the types). Both files are in Git, and ESLint ignores them.

- `build` passes `--js false`, so it does not write `index.js`.
- The napi CLI has no option to skip `index.d.ts`, so each build writes it. The content changes only when the Rust exports or the napi CLI version change.
- `build:native` and `build:debug` write both files.

If you change the exported Rust API, run `build:native`. Then commit `index.js` and `index.d.ts`.

### Packaging

`files` lists the `.node` binary, `index.js`, `index.d.ts`, `package.json`, and `README.md`. The `electron-builder.config.ts` of `apps/stage-tamagotchi` keeps the Rust sources and `target/` out of the app. Its `asarUnpack` keeps the `.node` binary out of the asar archive.
