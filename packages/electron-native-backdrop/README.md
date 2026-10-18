# Electron native backdrop

This package draws regional desktop blur behind transparent Electron content on macOS.
Each region has its own native backdrop layer. Rounded clips intersect the region without joining separate surfaces.

## Use

Use this package in the Electron main process. Keep its import external in the main bundle.

```ts
import { NativeBackdrop } from '@proj-airi/electron-native-backdrop'

const backdrop = new NativeBackdrop(window.getNativeWindowHandle())
backdrop.setRegions([
  {
    id: 'composer',
    x: 12,
    y: 400,
    width: 350,
    height: 80,
    radius: 20,
    opacity: 1,
    clips: [{ x: 0, y: 0, width: 380, height: 500, radius: 24 }],
  },
])

backdrop.setRegions([])
backdrop.dispose()
```

The blur radius is 16 points.
Coordinates use the top-left content origin in AppKit points. Multiply CSS coordinates and radii by the page zoom factor before sending them.
Do not multiply by the screen scale factor. A clip uses the same absolute content coordinates as its region.

`setRegions` replaces the complete region list. Region IDs remain stable across updates.
The limit is 256 regions and eight clips per region. Dimensions and radii are nonnegative finite numbers.
Opacity ranges from zero through one. A zero-sized or transparent region paints nothing.
Radii larger than half the shorter edge use that half-edge value, which matches a CSS capsule.

Dispose before replacing a window. Clear regions when the renderer navigates, reloads, crashes, or removes its surfaces.
The native window-close observer and environment cleanup also remove owned views. They do not replace main-process lifecycle ownership.

## Platform policy

The package supports macOS 14 and later on arm64 and x64. Runtime private-API checks still determine availability.
Linux and Windows build the JavaScript entry points without invoking the native compiler.
Importing the package does not load native code. Constructing `NativeBackdrop` on another platform throws an explicit unsupported-platform error.

The caller owns its readable CSS background when native blur is unavailable or fails.
The caller marks a surface active only after native attachment and its region update succeed.
This is the permanent platform policy. There is no screenshot capture or whole-window vibrancy fallback.

## Private API and transparency limits

This backend uses private `CABackdropLayer`, `CAFilter`, and WindowServer window-tag APIs.
A macOS or Electron update can change these APIs. Missing APIs and failed operations throw errors to the main-process caller.
The package is not suitable for Mac App Store distribution.

The backend sets the whole window background to white with alpha 0.001, disables automatic layer flattening, and updates window-server layer hosting.
This near-clear background keeps desktop sampling active. Pixels outside the regions remain clear at normal display precision, with that alpha limitation.
The host frame and clipping remain unchanged. Disposal attempts every restoration step before reporting an error.

Native layers ignore pointer hit tests. The renderer and main process retain ownership of click-through behavior.
Desktop blur can run in WindowServer. Application CPU time alone does not measure its complete rendering cost.

## Build and checks

```sh
pnpm -F @proj-airi/electron-native-backdrop build
pnpm -F @proj-airi/electron-native-backdrop typecheck
pnpm -F @proj-airi/electron-native-backdrop smoke:native
```

The build uses Xcode clang and headers beside the current Node executable: `../include/node`.
Set `NODE_HEADERS` to an explicit header directory when the Node installation stores headers elsewhere.
Missing headers stop the build. The build does not download toolchains or compile another architecture.
Build each macOS release architecture on its matching runner. Turbo caching is disabled for this platform-specific output.
Package `dist` as a runtime dependency and unpack `**/*.node` from ASAR.

The smoke script checks loading, argument rejection, idempotent disposal, and worker rejection. It does not create GUI windows.
Real Electron validation must also cover clip geometry, pointer behavior, reload, window closure, and loading from the packaged application.

## Attribution

The private backdrop configuration derives from [Ben Williams's electron-window-glass](https://github.com/biw/electron-window-glass/tree/7a31dea2c833cac83b211ba70d6d4e25f1cd0edd).
The package retains its MIT notice in `THIRD-PARTY-LICENSE.txt`.
