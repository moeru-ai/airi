---
name: use-vishot
description: Capture deterministic screenshots with Vishot and return a structured manifest of the generated images. Use for UI inspection, documentation, visual comparison inputs, or any screenshot task across Electron, web, and Capacitor applications; this skill is not specific to pull requests.
---

# Use Vishot

Use Vishot as the common screenshot interface and delegate runtime-specific behavior to the matching variant skill.

## Workflow

1. Identify every requested surface and state: route or window, viewport, theme, locale, fixture data, and any interaction needed to reach it.
2. Reuse product-owned Vishot scenarios, stories, routes, and stable selectors before creating temporary automation.
3. If the existing scenarios do not expose a valid reusable helper for the requested state, write the smallest disposable scenario or helper needed to reach it. Keep this automation outside tracked scenario directories unless the user separately asks to productize it. Run the complete startup, state preparation, capture, and artifact-inspection flow; do not stop after documenting that a helper is missing.
4. Select the runtime variant:
   - Invoke `$use-vishot-with-electron` for Electron windows.
   - Invoke `$use-vishot-with-web` for browser routes.
   - Invoke `$use-vishot-with-capacitor` for Capacitor WebView or native-shell evidence.
   - Also invoke `$use-vishot-with-input-file` when reaching the requested state requires a local file chooser or file input.
5. When developing or debugging the disposable automation, use a locally available `$agent-browser` to inspect web or Capacitor DOM and interaction paths. For Electron window discovery and interaction, also invoke `$agent-browser-electron`. Use these skills as development and validation aids; do not make their availability a prerequisite for Vishot capture.
6. Produce the final screenshot artifacts with Vishot whenever possible, even when agent-browser helped discover selectors or verify the interaction sequence. Treat a missing product helper as temporary automation work, not as proof that Vishot cannot capture the state; report a Vishot limitation only after reproducing a concrete runtime failure.
7. Give the variant an explicit output directory. Directory ownership belongs to the caller; Vishot only writes named capture artifacts into that directory.
8. Keep locale, theme, data, viewport, and readiness conditions deterministic when captures will be compared.
9. Inspect every generated image. Reject blank, loading, error, permission, onboarding, or unstable frames unless that is the requested state.
10. Return a manifest rather than relying on directory order:

   ```text
   id: settings-connection
   title: Settings / Connection
   runtime: web
   viewport: 1440x900
   image: /absolute/output/settings-connection.png
   ```

Include the failure reason instead of an image path when capture cannot complete. Do not invent PR, revision, upload, or repository-storage policy; the invoking workflow owns those decisions.

## Capture Contract

- Use stable IDs and human-readable titles for all requested states.
- Omit `--name` when the URL or Electron window produces a unique meaningful name. Use it when states would collide or need an explicit identifier.
- Treat `--settle-ms` as a final rendering delay, not a substitute for a state-specific readiness condition.
- Return absolute paths and the parameters needed to reproduce each capture.
