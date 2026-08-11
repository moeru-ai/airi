---
name: use-vishot-with-web
description: Capture deterministic web routes with Vishot. Use when the selected Vishot target is a locally runnable browser application and Codex must capture routes, responsive viewports, or interaction-driven UI states without requiring agent-browser.
---

# Use Vishot with Web

Prefer product-owned Vishot capture roots when available. Otherwise capture a local URL directly.

## Workflow

1. Identify the route, state, viewport, theme, locale, and output directory supplied by the caller.
2. Ensure Vishot's Playwright Chromium runtime exists. If Vishot reports a missing executable, run `pnpm exec playwright install chromium` once and retry.
3. Start the application with its repository-owned development or preview command.
4. Wait until the development server reports that it is listening, then let Vishot handle reload stability with an explicit `--settle-ms 2500`. Vishot intentionally has no default delay because it serves projects with different readiness contracts.
5. Run the documented scene command when the app exposes Vishot capture roots and a ready signal.
6. Otherwise capture the route directly:

   ```bash
   pnpm exec vishot render \
     --target browser \
     http://127.0.0.1:5173/settings \
     --width 1440 \
     --height 900 \
     --settle-ms 2500 \
     --output-dir /absolute/output/settings
   ```

7. Repeat for each requested route and viewport. Use `--name` only when URL-derived names collide or fail to describe the state.
8. Inspect each image for loading screens, stale data, iframe refusal, missing fonts, permission prompts, and animation instability.
9. Return its stable ID, title, viewport, and absolute path to `$use-vishot` or the caller.

## Viewport Sizing

Prefer Vishot's browser dimensions when the size is known before launch:

```bash
pnpm exec vishot render \
  --target browser \
  http://127.0.0.1:5173/settings \
  --width 1440 \
  --height 900 \
  --output-dir /absolute/output/settings
```

Use Playwright's viewport API when a browser scenario must change responsive states during the same run:

```ts
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForFunction(size => (
  globalThis.innerWidth === size.width
  && globalThis.innerHeight === size.height
), { width: 390, height: 844 })
```

- Web pages do not have an Electron `BrowserWindow`; `page.setViewportSize()` is therefore the correct way to change the browser viewport in scenario code.
- Do not use DOM APIs such as `window.resizeTo()` to control Vishot output. Browser security and window-manager behavior can ignore them, and they do not define the Playwright capture viewport reliably.
- Treat `width` and `height` as CSS pixels. The output image can contain more device pixels when the browser context uses a device scale factor above `1`.

## Scenario Readiness and Locators

- Implement readiness for the specific route and UI state. A heading, button, or expected text from one page is not a reusable readiness condition for another page.
- Wait in this order: let Vishot establish URL and reload stability, confirm the final route, wait for a state-specific visible locator, confirm transient overlays or loading indicators are gone, then let Vishot keep its final settle window for remaining bundling, refresh, animation, or rendering.
- Use text only when it is visible, unique, stable for the selected locale, and intrinsic to the intended state. Do not wait on generic headings, placeholders, network-derived values, or text copied from another scenario.
- Prefer semantic locators such as `getByRole('button', { name })` and `getByLabel()`. For an icon-only control, locate the owning button by its icon and click the button, not the icon node:

  ```ts
  const settingsButton = page.locator('button').filter({
    has: page.locator('[i-solar\\:settings-minimalistic-outline]'),
  }).first()
  ```

  Escape `:` in attribute-based icon selectors. Inspect the rendered DOM and repository icon usage before choosing a selector; avoid coordinates, `nth-child`, and incidental layout classes.
- Treat drawers, menus, accordions, onboarding, and responsive navigation as stateful UI. Check the desired content, `aria-expanded`, or `data-state` before clicking a toggle. Make `ensureOpen()`-style helpers idempotent: return when already open, otherwise click once and wait for the open-state postcondition.
- If no stable accessible or product-owned selector exists, add one to the product scenario or UI instead of weakening the wait to a fixed timeout.

## Constraints

- Keep the target app local. Do not use this workflow to capture an untrusted remote page.
- Keep route state deterministic with fixtures or seeded local storage when necessary.
- Use identical dimensions and device scale behavior for captures that will be compared.
