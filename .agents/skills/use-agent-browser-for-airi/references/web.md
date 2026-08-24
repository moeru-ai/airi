# stage-web

Start stage-web on a known origin, then use one fresh agent-browser session per format:

```bash
pnpm -F @proj-airi/stage-web dev --host 127.0.0.1 --port 5173
agent-browser --session airi-web-live2d open http://127.0.0.1:5173/settings/models
```

Set onboarding storage, reload, wait for `Select model`, and follow the shared detached-input import contract from `SKILL.md`.

After `Pick`:

```bash
agent-browser eval 'localStorage.getItem("settings/stage/model")'
agent-browser open http://127.0.0.1:5173/
agent-browser wait 'canvas'
agent-browser screenshot
agent-browser errors
agent-browser console
```

Use an explicit wait for renderer-specific readiness when the app exposes one. A canvas existing in the DOM is not sufficient evidence because it can remain blank after a loader failure.

For MMD, inspect console output for texture, archive, physics, and Vite dynamic-import failures. Report an imported card plus blank stage as “storage passed, rendering failed,” not as a successful upload test.

Close each session after evidence is collected. Fresh sessions avoid deleting unrelated IndexedDB models from a contributor's browser profile.
