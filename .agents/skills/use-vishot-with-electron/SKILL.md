---
name: use-vishot-with-electron
description: Capture deterministic Electron windows with Vishot. Use when the selected Vishot target is an Electron application and Codex must identify, prepare, and capture one or more renderer windows without relying on window creation order or agent-browser.
---

# Use Vishot with Electron

Keep product routes, selectors, window identities, and interaction scenarios in the product repository.

## Workflow

1. Identify the Electron package, built main entrypoint, requested window and state, and output directory supplied by the caller.
2. Search for an existing `defineScenario` module. In AIRI, start with `packages/scenarios-stage-tamagotchi-electron`.
3. Build the application when its main entrypoint is absent or stale. For a production/file renderer, wait for the repository build command to exit successfully. Pass `--settle-ms 2500` so Vishot waits through Vite bundling or renderer reloads; Vishot intentionally has no default delay.
4. Run the product scenario with `vishot capture --target electron`.
5. When no scenario is needed, use Vishot's direct window capture:

   ```bash
   pnpm exec vishot capture \
     --target electron \
     --app-entrypoint ./path/to/electron-main.js \
     --cwd . \
     --window-url '#/' \
     --settle-ms 2500 \
     --output-dir /absolute/output/main
   ```

6. Select a unique window with `--window-url` or `--window-title`. Omit both only when the first created window is intentionally the target.
7. If Playwright cannot discover Electron through the package-manager layout, resolve the app package's Electron binary and pass its absolute path with `--electron-executable`.
8. For a non-default state, create a temporary product scenario or extend the existing product-owned scenario with Playwright actions. Do not add product selectors to this skill.
9. Inspect every screenshot and confirm it depicts the intended window and state.
10. Return its stable ID, title, window identity, and absolute path to `$use-vishot` or the caller.

## Window Sizing

Resize the native `BrowserWindow` through Playwright's Electron handle when a scenario needs a deterministic content size:

```ts
const size = { width: 1200, height: 900 }
const browserWindow = await electronApp.browserWindow(page)

try {
  await browserWindow.evaluate((window, target) => {
    window.setContentSize(target.width, target.height)
  }, size)
}
finally {
  await browserWindow.dispose()
}

await page.waitForFunction(target => (
  globalThis.innerWidth === target.width
  && globalThis.innerHeight === target.height
), size)
```

- Use `BrowserWindow.setContentSize()` when the requested dimensions describe the renderer content captured by `page.screenshot()`.
- Use `BrowserWindow.setSize()` only when the requested dimensions describe the complete native window, including its frame and title bar.
- Do not use `page.setViewportSize()` to resize an Electron window. It overrides renderer viewport metrics through Playwright/CDP but does not resize the native `BrowserWindow`, so the visible window and screenshot state can disagree.
- Treat screenshot dimensions as device pixels. On a display with `devicePixelRatio = 2`, a `1200 × 900` content area normally produces a `2400 × 1800` screenshot.

## Electron Windows and UI State

- Do not treat `electronApp.firstWindow()` or the next `window` event as semantic window selection. They reflect creation order, and startup may create Chromium DevTools, splash, onboarding, hidden, or auxiliary windows before the intended product window.
- Identify a window with a combination of stable URL or hash route, title, and a state-specific visible locator. Scan `electronApp.windows()` until one window satisfies the identity predicate, and fail if no exact match appears. A `window` event alone is also insufficient when the app reuses an existing window.
- Exclude known non-target windows explicitly, such as `devtools://` pages or onboarding routes. Select the intended window before changing its hash or route; navigating a wrongly selected renderer can produce a plausible URL with blank or invalid content.
- Treat controls that expand, collapse, auto-hide, or reuse one toggle for both directions as state machines. For a Control Island or similar surface, first check whether the desired child control is visible. Expand only when it is absent, then wait for the child control before clicking it. Recheck immediately before the action when the surface can auto-collapse.

  ```ts
  async function ensureControlsOpen(page) {
    const settingsButton = page.locator('button').filter({
      has: page.locator('[i-solar\\:settings-minimalistic-outline]'),
    }).first()

    if (await settingsButton.isVisible().catch(() => false))
      return settingsButton

    await page.locator('button').filter({
      has: page.locator('[i-solar\\:alt-arrow-up-line-duotone]'),
    }).first().click({ force: true })
    await settingsButton.waitFor({ state: 'visible' })
    return settingsButton
  }
  ```

  Keep this logic product-owned because the icon, lifecycle, and open-state postcondition belong to the application.

## Scenario Readiness and Locators

- Implement each scenario around the actual window, route, and UI state. Do not assume every Electron page exposes the same expected text or reaches readiness through the same action sequence.
- Wait in this order: identify the exact window, confirm its final route, wait for a state-specific visible locator, confirm loading or transient overlays are gone, then let Vishot keep its final renderer stability window for remaining bundling, refresh, animation, or rendering.
- Use text only when it is visible, unique, stable for the selected locale, and intrinsic to the intended state. Generic headings, placeholders, startup messages, and text copied from another scenario are weak readiness signals.
- Prefer `getByRole()` or `getByLabel()` for accessible controls. For icon-only controls, locate the owning `button` with `filter({ has: iconLocator })` and click the button. Escape `:` in attribute-based icon selectors, inspect the rendered DOM first, and avoid coordinates, window order, `nth-child`, or incidental layout classes.
- If no stable locator exists, add a product-owned selector or scenario helper rather than replacing the condition with a longer fixed timeout.

## Stability

- Wait for a state-specific visible locator before capture; use the fixed delay only as the final Vite/HMR and rendering settle period.
- Reuse the same isolated application profile, locale, theme, data, and window size for captures that will be compared.
- Mock or seed network-backed content when it affects the visual result.
- Capture each requested Electron window separately.
- Treat a window selector mismatch as a failure; never fall back to a different window silently.
