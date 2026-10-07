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

## Fresh-data onboarding

Kirie now opens onboarding inside the main Android WebView.
Desktop builds keep the separate onboarding window.

The Android renderer initializes stage data before chat history.
This order prevents an unavailable Android chat dependency from blocking the first-run screen.

The 2026-10-07 comparison used Android API 35 and WebView 124.
The emulator used the host NVIDIA GeForce RTX 3060 through Vulkan 1.3.
Both recordings started on the launcher and opened the app at second 4.
Both apps displayed the shared Welcome page at second 8.
The aligned recordings end at second 14 and remove the remaining static frames.

The Kirie debug APK SHA-256 was `ff6ba7e0788bedd050448aec58aa18710e2173dac17a70b19f641a27c32b4f74`.
Temporary evidence is in `recordings-android/fresh-onboarding-812397724-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.
The evidence directory remains untracked.

That onboarding APK crashed after WebView creation on Android API 36 with WebView 133.
API 35 remained alive during the complete recording.
The later hardware-layer build closes this failure.

### Provider selection

Kirie Android disables the desktop-only NVIDIA provider at runtime.
The desktop renderer keeps NVIDIA available.

The fixed timeline starts recording at second 0 and launches each app at second 4.
It clicks `Setup with your provider` at second 12 and ends at second 18.
Both apps display the same provider order after the click.
The visible order ends with Groq and OpenRouter on the first screen.

The Kirie debug APK SHA-256 was `2b675fd0af969cd1bf0919bd451fbf43685bdc9d3d740bf4ece4010a04e5df81`.
Temporary evidence is in `recordings-android/provider-selection-521db9de1-2026-10-07/`.

### OpenAI configuration

Kirie now assigns a hardware layer to the Android WebView.
This layer keeps transparent WebView tiles on the GPU above the animated Godot surface.

The comparison used Android API 35 and WebView 124.
The emulator used the host NVIDIA GeForce RTX 3060 through Vulkan 1.3.
Both videos show the enabled state from seconds 0 through 3.
They show the disabled state from seconds 3 through 6.
They show the enabled state from seconds 6 through 9.

Each state shows the complete title, notice, input values, switch label, and Next button.
Android screen recording disturbed the transparent WebView composition in both apps.
The final videos use settled screenshots with the same event times.

The Kirie debug APK SHA-256 was `358e179bb78b45dae2e13afc8b8e70b17e742f84e6ab3a38dc044cdeb0310435`.
Temporary evidence is in `recordings-android/openai-config-103fbd5b6-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.

### Android 16 startup

The final comparison used Android API 36 and WebView 133.0.6943.137.
The emulator used the host NVIDIA GeForce RTX 3060 through Vulkan 1.3.
Both apps displayed the Welcome page after 15 seconds.
Both processes remained alive for 45 seconds before the provider click.
Both apps displayed the same provider list at second 50.

The Kirie log contained no fatal exception, native signal, or tombstone.
The Kirie debug APK SHA-256 was `358e179bb78b45dae2e13afc8b8e70b17e742f84e6ab3a38dc044cdeb0310435`.
Temporary evidence is in `recordings-android/api36-startup-52c4b4038-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.

### Onboarding permissions

The comparison used Android API 36 and WebView 133.0.6943.137.
Both apps displayed the same OpenAI validation failure for the test key.
`Continue Anyway` opened `Permission management` in both apps.

Both pages displayed matching notification and microphone cards.
Each request button opened the matching Android permission dialog.
Kirie sends these requests through its Android WebMessage channel.
The universal `src-web` renderer remains the packaged page.

The Kirie debug APK SHA-256 was `c4cd7e4926b90bc1dddeb71cfed9135505da6df01fb428bac517e8ef7b6df322`.
Temporary evidence is in `recordings-android/onboarding-permissions-cc34b1b61-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.

### Permission step continuation

The comparison used Android API 36 and WebView 133.0.6943.137.
Both apps started on `Permission management` with both permissions denied.
The `Next` button opened `Choose model` in both apps.

Both pages displayed `No available models` and the same OpenAI validation error.
The search field remained empty, and `Save and Continue` remained disabled.
The recordings use settled screenshots because screen recording disturbs transparent WebView tiles.

The Kirie debug APK SHA-256 was `c4cd7e4926b90bc1dddeb71cfed9135505da6df01fb428bac517e8ef7b6df322`.
Temporary evidence is in `recordings-android/onboarding-permission-next-d1b2dd338-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.

### Model step navigation

The comparison used Android API 36 and WebView 133.0.6943.137.
Both apps started on the failed `Choose model` page.
Tapping the search field opened the same Android keyboard and resized the page equally.

System Back hid the keyboard and kept the search field focused in both apps.
The page header Back button returned both apps to `Permission management`.
The recordings align these four states at two-second intervals.

The Kirie debug APK SHA-256 was `c4cd7e4926b90bc1dddeb71cfed9135505da6df01fb428bac517e8ef7b6df322`.
Temporary evidence is in `recordings-android/onboarding-model-navigation-e6cba9614-2026-10-07/`.
The comparison places stage-pocket on the left and Kirie on the right.

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
