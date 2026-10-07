# Android startup surface

Kirie Android loads the application renderer from `src-web/dist/index.html`.
The same `src-web` source builds the desktop and Android renderer.
Stage-pocket remains the behavior reference. Its Web build is never packaged inside Kirie.

## Native handoff

The Kirie Android plugin owns the WebView and its binary IPC transport.
The AIRI Android plugin finds that WebView and adds Android host behavior.
It configures system bars, permissions, file selection, external navigation, notifications, keyboard insets, and lifecycle callbacks.

The Godot scene creates the WebView after it registers AIRI and Kirie Eventa handlers.
The packaged renderer therefore uses the same host-context API on every supported platform.
Platform-specific behavior stays behind the host boundary.

## Packaged assets

`pnpm build:android` runs `kirie build` and exports the resulting Godot project.
It does not invoke the stage-pocket Vite build.
Kirie exposes the packaged page at `https://res.kirie.invalid/src-web/dist/index.html`.
Relative asset requests remain under `src-web/dist` and use Kirie's asset handler.

The 2026-10-07 debug APK contained `src-web/dist/index.html` and `src-web/dist/beat-sync.html`.
It contained no `src-web/dist/android` directory.
Its SHA-256 was `499c21ff298c2cc20d9faac2fa387104b6d1c9ca59891ac288b8ee907d1b3c08`.

## Runtime check

The corrected APK launched on Android API 36 with WebView 133.
The emulator used the host NVIDIA GeForce RTX 3060 through Vulkan 1.3.
Godot requested `res://src-web/dist/index.html?synced-leader=true`.
Chrome DevTools reported `https://res.kirie.invalid/src-web/dist/index.html?synced-leader=true#/`.

The visible controls were Kirie's stage controls, including `Expand` and `Open Chat`.
A fresh data directory had no profile or selected model, so the existing stage remained on its loading overlay.
This run establishes the renderer source and native handoff only.
It does not establish Android interaction parity.

## Reference boundary

Stage-pocket supplies the Android behavior reference for native and Web interactions.
Parity work compares its result with the universal Kirie renderer.
Shared AIRI packages can provide common components and stores.
Application entry points and build artifacts remain separate.

## Invalidated evidence

Android renderer recordings made from commit `024d35aca` through `dc02e73e9` packaged stage-pocket inside Kirie.
Those recordings compare stage-pocket with another stage-pocket build.
They do not establish Kirie renderer parity.

Native host tests remain useful when their result does not depend on the packaged page.
New renderer acceptance starts after the universal page launches on Android.
