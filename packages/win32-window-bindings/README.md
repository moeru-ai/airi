# @proj-airi/win32-window-bindings

Node-API bindings (built with [`napi-rs`](https://napi.rs/)) that expose the Win32 window metadata needed by AIRI’s Electron dock controller.

- Enumerates top-level windows in z-order.
- Reads rect, visibility/minimized flags, `GWL_EXSTYLE`, owner PID, title, and DWM cloaking state.
- Returns window ids in `win32:<hwndHex>` format to match existing overlay logic.

## Building

The package builds only on Windows hosts. The `prepare` script is a no-op on non-Windows platforms so installs on macOS/Linux/WSL2 remain fast and safe.

```bash
pnpm -F @proj-airi/win32-window-bindings build    # Windows only
pnpm -F @proj-airi/win32-window-bindings build:debug
```

At runtime, consumers should gate loading on `process.platform === 'win32'` and fall back to Electron-only tracking elsewhere.
