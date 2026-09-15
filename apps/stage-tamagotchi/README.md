# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

## Computer use

In the desktop chat composer, turn on **Use computer** before sending a desktop task.
The button starts off and resets when the composer is destroyed. While a request runs, its selection is locked.
Turn it off before sending messages that must not receive computer-use tools.

The selected request receives `computer_use` and `computer_use_read_image`.
The first tool accepts AUV arguments, such as `["invoke", "window.list"]`.
Use `["invoke", "--help"]` and command-specific help to discover supported operations.
The image tool returns screenshot bytes as model image content. It accepts only PNG and JPEG artifacts inside the app's computer-use store.
Use a model and provider that support tool calls and image tool results for visual tasks.

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
