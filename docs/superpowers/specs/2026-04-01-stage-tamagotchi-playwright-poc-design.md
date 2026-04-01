# Stage Tamagotchi Playwright POC Design

## Goal

Build a proof of concept that launches the Electron `stage-tamagotchi` app with Playwright, drives the existing UI without app-side automation hooks, captures screenshots for the `main`, `settings`, and `chat` windows, and generates one documentation page from the produced artifacts.

This POC is intended to prove:

- Electron app automation is feasible in this repo with Playwright.
- Cross-window discovery and capture can be performed from outside the app.
- Captured artifacts can feed generated docs content.

This POC does not attempt to solve deterministic fixtures, visual regression testing, or the final docs presentation model.

## Constraints

- Use the normal app boot path.
- Do not add app code changes unless strictly necessary.
- Prefer Playwright Electron support over Vitest browser mode.
- The first generated docs output can be simple markdown.

## Non-Goals

- Stable golden screenshots across machines.
- Full scenario coverage for every Electron window.
- Rich docs components for screenshots or galleries.
- Mocked providers, mocked onboarding, or seeded renderer state.
- New main-process automation bridge in the initial implementation.

## Recommended Architecture

Create a new package dedicated to Playwright-driven Electron automation, separate from existing Vitest projects.

Suggested package responsibilities:

- Launch the Electron app in a testable mode.
- Run one scenario covering `main`, `settings`, and `chat`.
- Capture screenshots and scenario metadata.
- Generate one markdown docs page that references the captured images.

Suggested package name:

- `packages/stage-tamagotchi-playwright-poc`

## Why Playwright Test Instead Of Vitest

The repo already uses Vitest broadly and also uses `@vitest/browser-playwright` in a browser-focused package. That is not the right abstraction for this POC because this work targets Electron automation, window discovery, and multi-window control rather than browser-only component tests.

For this POC:

- Use `@playwright/test` for the runner.
- Use Playwright Electron support to launch the Electron app.
- Keep the package independent from the root Vitest project list.

This avoids forcing Electron automation into the browser-mode Vitest model and keeps the eventual long-term test harness reusable.

## Package Layout

Suggested initial structure:

```text
packages/stage-tamagotchi-playwright-poc/
  package.json
  playwright.config.ts
  scripts/
    generate-docs.ts
  src/
    fixtures/
      electron.ts
    scenarios/
      main-settings-chat.spec.ts
    utils/
      app-path.ts
      artifact-paths.ts
      screenshots.ts
      windows.ts
  artifacts/
    screenshots/
    manifests/
```

## Scenario Shape

The first scenario should:

1. Launch `stage-tamagotchi`.
2. Wait for the main window to be visible and stable.
3. Interact with the main window using existing UI only.
4. Open the settings window through visible UI if possible.
5. Open the chat window through visible UI if possible.
6. Capture screenshots for each discovered window.
7. Write a manifest describing what was captured.
8. Generate one docs page that embeds the screenshots and basic notes.

The scenario should prefer accessible selectors, visible text, and stable routes. If selectors are weak, the package should isolate selector logic in helpers rather than inline it in the test.

## Window Discovery Strategy

The app already uses explicit `BrowserWindow` managers for major windows. The Playwright side should not assume direct access to those managers.

Instead, the POC should:

- Launch the app via Playwright Electron.
- Watch Playwright windows as pages are created.
- Identify windows by one or more of:
  - page title
  - URL hash route
  - visible heading or stable text

The helpers should normalize window identification into names like:

- `main`
- `settings`
- `chat`

## Interaction Strategy

The default strategy is pure UI driving:

- Use clicks and keyboard shortcuts only when they are visible and stable.
- Avoid private IPC assumptions.
- Avoid direct main-process calls except for Playwright’s standard Electron lifecycle control.

Because the app boots normally, the test should tolerate that some content may vary. The POC only needs to prove that the windows can be reached and captured.

## Strictly Necessary Fallback

If the POC cannot open `settings` or `chat` reliably through existing UI surfaces, the only acceptable fallback for this phase is a minimal, explicitly isolated app-side hook for opening those windows.

That fallback is not part of the initial implementation target, but the package should be structured so it can adopt it later without redesign.

## Artifact Output

The POC should emit:

- PNG screenshots for `main`, `settings`, and `chat`
- a JSON manifest describing the scenario run
- one generated markdown page for the docs site

Suggested manifest shape:

```json
{
  "scenario": "main-settings-chat",
  "createdAt": "2026-04-01T00:00:00.000Z",
  "app": "stage-tamagotchi",
  "windows": [
    {
      "name": "main",
      "title": "AIRI",
      "route": "/",
      "image": "/assets/generated/stage-tamagotchi-poc/main.png"
    }
  ]
}
```

The docs generation step should treat the manifest as the source of truth and render markdown from it.

## Docs Generation

For the POC, docs generation should remain simple:

- Write one generated markdown page under the docs content tree.
- Embed screenshots from a generated asset folder.
- Include a short explanation of the scenario and capture timestamp.

Suggested docs output:

- page path:
  - `docs/content/en/docs/manual/tamagotchi/generated-playwright-poc.md`
- asset path:
  - `docs/content/public/assets/generated/stage-tamagotchi-poc/*.png`

The docs page should be generated, not hand-maintained.

## Data Flow

Runtime flow:

1. Playwright launches Electron.
2. Scenario interacts with `main`.
3. Scenario opens and detects `settings`.
4. Scenario opens and detects `chat`.
5. Scenario captures screenshots.
6. Scenario writes a manifest.
7. Docs generator consumes the manifest and writes markdown plus asset references.

This keeps capture and docs generation decoupled while preserving a simple end-to-end story.

## Verification

The POC is successful if:

- the package launches the Electron app from this monorepo,
- the scenario reaches `main`, `settings`, and `chat`,
- screenshots are written for all three,
- one docs page is generated from those artifacts,
- the generated docs page renders in the docs site.

## Risks

### UI Reachability

The biggest risk is not screenshot capture itself, but opening `settings` and `chat` through visible UI consistently when the app boots in its normal state.

### Environment Sensitivity

Because the app boots normally, onboarding state, provider state, and platform behavior may affect what appears. This is acceptable for the POC but should not be mistaken for a visual regression system.

### Overlay Window Behavior

The `main` window uses overlay-like Electron configuration and may behave differently across platforms. The scenario should use explicit waits for visibility and settle time before capture.

## Testing Strategy

For the POC:

- run Playwright against the Electron app directly,
- keep assertions narrow and structural,
- verify generated files exist,
- do not overfit on fragile pixel assumptions.

The initial checks should focus on:

- windows opened,
- screenshots created,
- manifest created,
- docs page generated.

## Follow-Up After POC

If the POC works, the next phase should decide:

- whether to keep pure UI driving or introduce a minimal automation bridge,
- how to model reusable scenarios,
- whether docs should consume raw manifests or generated Vue components,
- how to make captures deterministic enough for long-term maintenance.
