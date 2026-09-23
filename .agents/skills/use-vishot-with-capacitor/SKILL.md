---
name: use-vishot-with-capacitor
description: Capture deterministic Capacitor application screens with Vishot. Use when the selected Vishot target is a Capacitor app and Codex must capture its locally served WebView at mobile dimensions or distinguish WebView evidence from native-shell evidence.
---

# Use Vishot with Capacitor

Capture the locally served WebView through Vishot by default. Add native evidence only when the requested state depends on native UI or platform behavior.

## WebView Workflow

1. Identify the route, state, platform mode, orientation, viewport, theme, locale, and output directory supplied by the caller.
2. Ensure Vishot's Playwright Chromium runtime exists. If Vishot reports a missing executable, run `pnpm exec playwright install chromium` once and retry.
3. Start the app's web development command. In AIRI, use `VITE_SKIP_MKCERT=1 pnpm -F @proj-airi/stage-pocket dev:web` for a local HTTP origin.
4. Wait until the development server reports that it is listening, then let Vishot handle WebView reload stability with an explicit `--settle-ms 2500`. Vishot intentionally has no default delay because it serves projects with different readiness contracts.
5. Capture the route at the requested mobile viewport:

   ```bash
   pnpm exec vishot render \
     --target browser \
     http://127.0.0.1:5273/settings \
     --width 390 \
     --height 844 \
     --settle-ms 2500 \
     --output-dir /absolute/output/settings
   ```

6. Repeat for each requested state and viewport. Inspect each output before returning it.
7. Return its stable ID, title, platform/viewport details, and absolute path to `$use-vishot` or the caller.

## Scenario Readiness and Locators

- Implement readiness for the specific route, viewport, platform mode, and UI state. Desktop text and controls may be hidden, renamed, or moved into mobile navigation, so do not reuse an expected string without inspecting the rendered mobile state.
- Wait in this order: let Vishot establish URL and reload stability, confirm the final route, wait for a state-specific visible locator, confirm loading indicators, sheets, permission explanations, or startup overlays are resolved, then let Vishot keep its final settle window for remaining bundling, refresh, animation, or rendering.
- Use text only when it is visible, unique, stable for the selected locale, and intrinsic to the intended state. Avoid generic headings, placeholders, network-derived values, and text that belongs only to another viewport or platform.
- Prefer semantic locators such as `getByRole('button', { name })` and `getByLabel()`. For an icon-only control, locate the owning button by its icon and click the button, not the icon node:

  ```ts
  const menuButton = page.locator('button').filter({
    has: page.locator('[i-solar\\:hamburger-menu-outline]'),
  }).first()
  ```

  Escape `:` in attribute-based icon selectors. Inspect the WebView DOM and repository icon usage before choosing a selector; avoid screen coordinates, `nth-child`, and incidental layout classes.
- Treat bottom sheets, drawers, tab overflow, accordions, onboarding, and auto-hiding controls as stateful UI. Check the desired content, `aria-expanded`, or `data-state` before toggling. Make `ensureOpen()`-style helpers idempotent and wait for the intended open-state postcondition.
- If the state belongs to native UI rather than the WebView, use platform-owned automation or report that native evidence is unavailable; a DOM locator cannot verify a system permission sheet or native keyboard.

## Native Evidence

1. Determine whether the UI difference depends on native behavior. Do not claim a browser capture verifies status bars, safe areas, system permissions, native keyboards, camera views, or plugin-owned UI.
2. If the contributor already has the required simulator/device and project toolchain, run the repository-owned Capacitor command and use the platform's existing screenshot command.
3. Do not install a mobile automation framework or select a new dependency implicitly. Report the missing native evidence to the caller when platform tooling is unavailable.
