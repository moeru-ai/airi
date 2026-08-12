---
name: use-agent-browser-with-input-file
description: Upload local files through ordinary, hidden, dynamically created, detached, multiple, or native-backed file inputs with agent-browser in web and Electron applications. Use when testing file selection, drag-or-choose flows, framework file-dialog composables, or post-upload application behavior.
---

# Use Agent Browser with an Input File

Invoke `$agent-browser` first and run `agent-browser skills get agent-browser --full` before issuing browser commands. For Electron, also invoke `$agent-browser-electron` and attach to the intended renderer target.

Resolve the input file to an absolute path and verify that it exists. Then inspect the DOM before choosing an upload method:

- For an attached `input[type="file"]`, including a visually hidden input, read [references/attached-input.md](references/attached-input.md).
- For an input created on demand or kept detached from the DOM by application code, read [references/detached-input.md](references/detached-input.md).
- For a native file chooser or a flow where no HTML input can be addressed, read [references/native-file-chooser.md](references/native-file-chooser.md).
- For evidence requirements after the file is assigned, read [references/verify-upload.md](references/verify-upload.md).

## Workflow

1. Open the target route and inspect `snapshot -i` and the DOM around the upload control.
2. Determine whether the input already exists, appears after interaction, remains detached, or delegates to a native picker.
3. Apply the matching reference without changing application source code.
4. Re-snapshot after each interaction because element refs can become stale.
5. Verify application-specific processing, persistence, and final output separately.
6. Inspect browser errors and relevant console output.
7. Restore any temporary browser-session instrumentation and close the session.

Keep the same `--session` and, for Electron, `--cdp <port>` options on every command. When Electron exposes several targets, use the discovery process from `$agent-browser-electron` and confirm the active target URL before uploading.

## Handoff to Vishot

Use Agent Browser to discover inputs, diagnose selectors, and prove the interaction. Once the flow is stable, encode it in a Playwright-backed Vishot scenario with `$use-vishot-with-input-file` when deterministic visual evidence is required.

Do not treat a successful `upload` command as completion. File assignment, application import, persistence, and rendering are distinct checkpoints.
