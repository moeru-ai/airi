# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

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

## Verification

Run the focused runtime tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use/runtime.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the bundled CLI/private-daemon test.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.

## Desktop companion

Open **Settings → System → General → Desktop companion** for the resize border, notifications, privacy, and DND controls.
The border setting persists in the main process. Disabling the border keeps the resize hit zones.

The diagnostics distinguish explicit X11/XWayland selection from session-based detection.
Native Wayland lacks global cursor coordinates and window positioning in Electron.
AIRI uses recent pointer events inside its own window on that backend. Missing or stale samples return gaze to neutral.
For the explicit XWayland path, run `pnpm -F @proj-airi/stage-tamagotchi dev:xwayland` or `start:xwayland`.
These commands require an available XWayland server.

On supported backends, Electron supplies cursor points and content bounds in DIP.
AIRI subtracts the content origin and divides by page zoom once. Display scale factors never multiply these coordinates.
Display changes invalidate the previous sample and publish a new layout revision.
Negative origins and mixed scale factors remain in the desktop coordinate space.

The notification center accepts AIRI events through Eventa. Existing Spotlight results use this center.
It does not read notifications from other applications. The settings test sends a high-priority AIRI event.
Native banner support does not establish delivery or visibility. The unread inbox remains available if the native service fails.
An OS close or timeout does not mark a notification read. A click, **Mark read**, or **Mark all read** acknowledges it.
**Clear history** removes retained groups and resets the unread count.

Notification previews are off by default. With previews off, neither the saved history nor native banners contain the event body.
Disabling previews removes stored bodies and closes active banners. The OS can retain a previously displayed preview in its own history.
Application DND suppresses banners and reaction requests without discarding unread events. It does not change the OS DND setting.
AIRI never uses critical urgency to bypass a notification server policy.

History retains 100 groups and 200 recent event IDs. Older unread groups remain in a separate persisted count.
A banner closes when its record leaves the retained history. **Mark all read** acknowledges the older unread count.
Repeated unread events with the same source and key coalesce for 30 seconds.
Native banners have a 10-second interval. Priority reaction intents have a separate 30-second interval and expire after five seconds.
The main process writes state before it acknowledges a new event. Restarts never replay native banners or reaction intents.
Reads and writes share a four-MiB size limit that includes JSON escaping. Maximum-length histories remain loadable after restart.
Invalid existing storage remains untouched. A storage error appears in the settings panel.

Priority reactions use the shared motion owner and a bounded wave queue. User actions and games take priority over waves.
DND, manual manipulation, model changes, and expired intents cannot restart stale playback. See [the integration contract](../../docs/ai/companion-integration.md).
Native window expansion, KWin transport, roaming, and minimized-window gestures remain separate work.

Primary platform contracts: [Electron screen](https://www.electronjs.org/docs/latest/api/screen),
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window),
[Notification](https://www.electronjs.org/docs/latest/api/notification), and
[freedesktop notifications](https://specifications.freedesktop.org/notification/latest-single/).

### Desktop companion checks

```sh
pnpm exec vitest run --project stage-tamagotchi:node apps/stage-tamagotchi/src/main/services/electron/desktop-*.test.ts apps/stage-tamagotchi/src/main/services/electron/screen.test.ts apps/stage-tamagotchi/src/renderer/utils/desktop-reaction.test.ts
pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project browser src/renderer/composables/use-desktop-cursor.browser.test.ts
```

The node suite covers unavailable/error delivery, repetition, coalescing, read/clear, restart, DND, privacy, bounded history, IPC isolation, and display geometry.
The browser suite covers local pointer expiry, global sample expiry, hotplug invalidation, and snapshot hydration races.
Native notification appearance, compositor behavior, and mixed-DPI hardware require a live desktop check.
