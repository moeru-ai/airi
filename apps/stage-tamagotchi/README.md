# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

## Local model files

Sherpaw downloads remote model files into the app user data directory. The main
process serves installed files to the renderer through `airi-model`. The desktop
release bundles X-ASR through `airi-sherpaw`. Sherpaw settings control
remote downloads. The Resource Status Island shows transfer progress and errors.

## Computer use

The desktop chat composer starts with **Use computer** on. Turn it off to send a request without desktop access.
The selection is local to the composer. A new composer starts with it on. While a request runs, its selection is locked.
Turn it off before sending messages that must not receive computer-use tools.

Only the current selection grants access, including retries and tool reruns. Historical messages do not grant access.
The selected request receives `computer_use` and `computer_use_read_image`.
The first tool accepts AUV arguments, such as `["invoke", "window.list"]`.
Use `["invoke", "--help"]` and command-specific help to discover supported operations.
The image tool returns a screenshot as model image content. It accepts only PNG and JPEG artifacts inside the app's computer-use store.
Use a model and provider that support tool calls for visual tasks.
With **Use the vision model for tool images** on, the vision model reads the screenshot first for a chat model whose provider does not report image input.
The chat model then gets a text description. It has the visible text and layout, but no pixel positions.
Use AUV commands such as `screen.findText` to get coordinates.

Electron starts the matching AUV SDK and CLI 0.0.16 on demand, over a private Unix socket or Windows named pipe.
It serializes commands across windows, stores artifacts under the app's user-data directory, and stops the daemon during app shutdown.
The CLI runs without a shell. Model arguments cannot change the device, endpoint, run, or storage root.
Nonzero exits retain AUV output and failure details as tool errors. A zero exit code does not prove that the intended UI change occurred.

On macOS, grant Accessibility and Screen Recording permissions to the launching app when the OS requests them.
Some application actions also need Automation permission. If `app.probePermissions` reports missing screen-recording permission, a capture can contain only the desktop background despite exit code zero. Available commands depend on the OS and AUV backend.
Use this feature for local native applications. It does not expose a remote-device gateway or replace the separate `services/computer-use-mcp` service.

The desktop package includes the platform CLI as an optional dependency and unpacks its executable from ASAR.
Do not omit optional dependencies when building an installer. Windows ARM64 and Linux musl do not have a matching CLI in this version.

## Fullscreen workspace

The fullscreen workspace is an experiment, and it is off by default. It shows settings and the chat beside the character, in a workspace that covers the work area.
Turn on **Fullscreen workspace** in the experimental features of the system settings. Then choose a window mode:

- **Single window**: the main window grows over the work area and becomes the workspace.
- **Separate window**: a window of its own shows the workspace with its own view of the character. The main window stays on the desktop, above that window.

The two modes differ only in the window that hosts the workspace. Both use the same parts in `src/renderer`:

- `components/fullscreen/surfaces.ts` is the registry of the surfaces, such as settings and the chat.
- `stores/fullscreen.ts` holds the phase of the mode, the surface that shows, and the surfaces that stay mounted.
- `composables/use-fullscreen-layout.ts` holds the surface width, its drag, and the place of the character.
- `components/fullscreen/fullscreen-overlay.vue` shows the island and the surface. `fullscreen-backdrop.vue` shows the backdrop.

Each host adds only what its window needs:

- `pages/index.vue` is the page of the main window. It runs the open and close transitions, because the main window moves and grows.
- `pages/workspace.vue` is the page of the separate window. The window covers the work area from the start.
- In `src/main`, `windows/main` and `windows/workspace` answer the same fullscreen events for their windows.
- `src/main/index.ts` opens settings and the fullscreen chat where the mode says.

To add a surface, add an entry to `fullscreenSurfaces`, and add its id to `FullscreenSurfaceId` in `src/shared/eventa`.
The island then shows its button, and its panel stays mounted until the mode closes. The routes under its `prefixes` sit under the page of each host.

When the user changes the window mode, `moveFullscreen` in `src/main/windows/shared/fullscreen.ts` moves the workspace.
It packs the surfaces of the old window, closes that window through its pages, and opens the pack in the new window.
A page with unsaved changes can stop the move. A panel that holds state calls `useFullscreenCarry(surface, { collect, restore })`.
The chat carries its unsent draft this way, and settings carry the page that shows.

The view of the character in the separate window is a second render. It only renders the model, so the main window stays the one host of voice.
It does not follow speech or expressions.

## Verification

Run the focused runtime tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use/runtime.test.ts
```

Run the tests of the fullscreen workspace:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/renderer/stores/fullscreen.test.ts src/renderer/window-context.test.ts src/main/windows/chat/mode-switch.test.ts src/main/windows/shared/fullscreen.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the bundled CLI/private-daemon test.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.

## Local AI request proxy

Open Settings > System > General and enable **Local AI request proxy**.
New AI HTTP requests use the desktop network stack and avoid browser CORS restrictions.
The switch defaults to disabled. AIRI saves it on this device and shares it across desktop windows.

The proxy covers chat, HTTP speech and transcription, models, voices, connection checks, image generation, and image downloads.
Existing main-process image generation remains native with either setting.
WebSocket and browser-local inference keep their existing APIs. This HTTP bridge does not repair upstream authentication, rate limits, certificates, or connectivity.
The bridge adds no retries. Provider SDKs retain their own retry policies, including Replicate.

Requests already in progress retain their transport. The proxy has no upload size limit.
Uploads use memory buffers. Available memory and upstream limits still apply.
If the selected proxy is unavailable, requests fail without silently switching to direct access.

For the transport contract and lifecycle, read [the shared package README](../../packages/ai-transport/README.md).

### Network proxy

**Settings > System > General > Network proxy** controls the desktop Chromium network route, independently of the local AI HTTP bridge.
Choose the system proxy (default), a direct connection, or a custom HTTP or SOCKS5 proxy without authentication.
Custom addresses use forms such as `http://127.0.0.1:7890` or `socks5://127.0.0.1:1080`.
Optional comma-separated bypass rules select direct destinations. Chromium retains its default loopback bypass rules.

The default renderer Session and the separate AI HTTP Session receive the same settings. Their cookies remain separate.
This includes browser HTTP and WebSocket connections, sign-in requests, page resources, and native AI HTTP requests.
Node clients that do not use Chromium are outside this setting.
Network proxy settings do not remove browser CORS restrictions. Enable the local AI HTTP bridge for that purpose.

Saved settings apply to new connections. Existing WebSockets and reused HTTP connections keep their previous route.
Saving does not close sockets or restart active requests. A custom proxy has no automatic direct fallback.
Settings stay on the current device and synchronize across desktop windows.

To run the real Electron transport fixture:

```sh
pnpm -F @proj-airi/ai-transport build
pnpm -F @proj-airi/stage-tamagotchi exec tsdown --config scripts/ai-transport-smoke.config.ts
pnpm -F @proj-airi/stage-tamagotchi exec electron out/ai-transport-smoke/ai-transport-smoke.cjs
```

The fixture writes `out/ai-transport-smoke/result.json`. It uses hidden windows, loopback HTTP servers, and a temporary device configuration.
