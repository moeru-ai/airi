---
name: enforce-rules-for-ui-tests
description: Decide how to verify AIRI UI work, and stop large DOM-driven component tests. Use whenever you add, change, review, or plan tests for a Vue page, component, layout, settings page, dialog, or UI flow, or when you consider `vitest-browser-vue`, `@vue/test-utils`, `render(...)`, `page.getBy...`, or a `*.browser.test.ts` file for UI. Also use when you fix a UI bug, iterate on a design, or must prove that a UI change works, even if the user does not mention tests.
---

# Enforce AIRI UI Test Rules

AIRI verifies most UI work by looking at it, not by DOM assertions. Use Histoire stories, Vishot captures, screen recordings, and `agent-browser` to iterate on a UI. Keep automated tests for logic, for primitives, and for calculations that a person cannot check by eye.

## Why

A Vitest browser test or a Vue component test that renders a page and asserts on elements acts as an end-to-end test. Such a test has these problems:

- It mocks the router, Pinia, i18n, and the network, so it tests a fake app.
- It locks the DOM structure, the text, and the class names. Each design iteration breaks it, and the agent spends the iteration on test repair.
- It is slow, and it does not show whether the UI looks right.

A story or a capture shows the real result. A reviewer can check it in seconds and find problems that no assertion names, down to pixel alignment.

## Choose the verification

| Change | Verification |
| --- | --- |
| Business logic, a store, a composable, a formatter, or a data mapping | A unit test without a DOM. Move the logic out of the component first when necessary. |
| Layout, style, text, page composition, or a page flow in `apps/*`, `packages/stage-pages`, or `packages/stage-ui` | No DOM test. Use a Histoire story, a Vishot capture or a recording, and `agent-browser`. |
| A primitive in `packages/ui` | A component test is allowed. Test the public contract: props, emits, slots, keyboard, focus, and ARIA. For a position or collision bug, for example a popup outside the viewport, a browser test that measures the geometry is allowed. |
| Three.js, canvas, WebGL, or shader rendering | A test is allowed. Prefer a test of the pure calculation. Use browser mode when the real platform API is necessary. |
| Complex animation, layout, position, geometry, or hit-test calculation | A test of the pure function with explicit inputs. Use browser mode only when the calculation needs real layout. |
| A bug fix in a complex UI calculation or an animation | A regression test that pins the calculation. Obey the reproduction rules of `enforce-rules-for-vitest`. |

When a change is in more than one row, split it. Test the logic part. Check the visual part by eye.

In the allowed rows, also add a story or a capture. A test pins the calculation. A story shows the result.

## Avoid

These rules apply to business pages and business components. The allowed rows in the table above are exceptions.

- Do not render a whole page or a business component in a test to assert on text, element counts, class names, or child components.
- Do not mock `fetch`, the router, the auth store, and i18n only to mount a page.
- Do not assert on page layout through the DOM, for example the order of sections or a computed style, when a capture shows it.
- Do not add a `*.browser.test.ts` file for a settings page, a dialog, or a panel that has no complex calculation.

## Do instead

1. Move the logic out of the component into a pure function or a composable. Unit test it.
2. Add or update a Histoire story in `packages/stage-ui` for each state: loading, empty, error, and ready. Use fixture data. Stories are interactive, and you can compare them pixel to pixel.
3. Capture the result with `use-vishot`. Record the screen when the behavior is motion or a sequence.
4. Use `agent-browser` to click through the flow and to read the DOM while you develop.
5. When a state or a flow needs a check again later, add a reusable scenario to the matching `packages/scenarios-*` package.

## Reusable scenarios

A scenario is a small Playwright or Vishot script that brings the app to a named state and captures it.

- Put it in the `packages/scenarios-*` package of its runtime. Example: `packages/scenarios-stage-tamagotchi-electron/src/scenarios`.
- Give it a stable name for the surface and the state, for example `settings-connection`.
- Make it deterministic: fixed viewport, locale, theme, and fixture data. Wait for a ready condition, not only a delay.
- Reuse the helpers of the package. Do not copy a helper into a new scenario.
- Do not put private data in fixtures. Use `example.com` and similar reserved values.
- Update the README of the package when you add a scenario that other agents can run.

## Refactor progressively

Some existing tests render pages and assert on elements. Reduce them over time.

- In a change that touches such a test, move each logic assertion to a unit test of the extracted function.
- Replace the remaining layout and text checks with a story or a scenario.
- Then remove the DOM test. Tell the reviewer which story, scenario, or unit test covers each removed check.
- Keep a regression check that guards a real bug. Do not delete an assertion only to make a test pass.
- Do not rewrite unrelated test files only for this rule. List them as follow-up work.

## Review checklist

- Does each new DOM test belong to `packages/ui`, to a renderer, or to a complex calculation?
- Did the author move logic out of the component and unit test it?
- Do a story, a capture, or a scenario show each changed UI state?
- Does each removed test have a named replacement?
