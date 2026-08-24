---
name: use-vishot-with-input-file
description: Drive a local file-input or file-chooser workflow inside a Vishot browser or Electron scenario, then capture the resulting deterministic UI state. Use when screenshot readiness depends on uploading, importing, opening, or selecting a local file rather than the application's default startup data.
---

# Use Vishot with an Input File

Invoke `$use-vishot` and its runtime variant first. Put file interaction in a product-owned or disposable `defineScenario` module; Vishot performs the final capture.

## File chooser pattern

Pass the absolute input path through an environment variable. Do not embed a contributor-specific path in tests or reusable scenario source.

```ts
const inputFile = process.env.VISHOT_INPUT_FILE
if (!inputFile)
  throw new Error('VISHOT_INPUT_FILE is required')

const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('menuitem', { name: 'Import' }).click(),
])

await fileChooser.setFiles(inputFile)
await page.getByText(inputFile.replaceAll('\\', '/').split('/').at(-1)!, { exact: true })
  .waitFor({ state: 'visible' })
await capture('imported-file', page)
```

Use `locator.setInputFiles(inputFile)` when a stable `<input type="file">` already exists. Prefer `waitForEvent('filechooser')` when the application creates the input lazily or hides it behind a menu.

## Readiness

1. Verify the absolute file exists before launching the scenario.
2. Start waiting for `filechooser` before clicking the control that opens it.
3. Wait for a file-specific postcondition such as its displayed name, imported record ID, parsed preview, or selected renderer.
4. Select the imported item if upload alone does not activate it.
5. Wait for the destination surface, not merely for the chooser to close.
6. Capture with Vishot and inspect the image. A default model or unchanged startup view is a failed upload scenario.

Keep secrets and private filenames out of scenario IDs, screenshot names, test names, and comments. Supply private local paths only through environment variables or command arguments.
