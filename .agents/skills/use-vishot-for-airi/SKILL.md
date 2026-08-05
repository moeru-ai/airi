---
name: use-vishot-for-airi
description: Run AIRI-owned Vishot scenarios for stage-web or stage-tamagotchi, including skipping first-run onboarding and importing a local Live2D, VRM, or MMD display model before capture. Use when AIRI visual evidence must exercise a contributor-supplied avatar file instead of a preset model.
---

# Use Vishot for AIRI

Invoke `$use-vishot`, `$use-vishot-with-electron`, and `$use-vishot-with-input-file`. Reuse the product helper at `packages/scenarios-stage-tamagotchi-electron/src/scenarios/display-model-from-file.ts`.

## Local model capture

Build Electron, then pass the model path and explicit format through the environment:

```bash
pnpm build:tamagotchi

AIRI_DISPLAY_MODEL_FORMAT=live2d \
AIRI_DISPLAY_MODEL_PATH='/Users/neko/Pictures/Project AIRI 静态资产/形象 - Iru/Live2D/Iru v2.0 @ Project AIRI 运行文件.zip' \
pnpm exec vishot capture \
  ./packages/scenarios-stage-tamagotchi-electron/src/scenarios/display-model-from-file.ts \
  --target electron \
  --app-entrypoint ./apps/stage-tamagotchi/out/main/index.js \
  --cwd . \
  --settle-ms 2500 \
  --output-dir ./.vishot/display-model/live2d
```

Use `AIRI_DISPLAY_MODEL_FORMAT=vrm` with a local file such as:

```text
/Users/neko/Pictures/Project AIRI 静态资产/形象 - Iru/VRM/ReLU @ Project AIRI.vrm
```

Use `AIRI_DISPLAY_MODEL_FORMAT=mmd` with `.zip`, `.pmx`, or `.pmd`. A license-readable public candidate is [CG-CA Gene](https://github.com/mmdagent-ex/gene), whose repository provides PMX/PMD models and textures under CC BY 4.0. Prefer a ZIP containing the model and its texture directories.

## Scenario contract

The AIRI helper:

- marks onboarding completed in the test profile and closes an already-open onboarding renderer;
- opens Settings → Models through product-owned window helpers;
- starts waiting for the Playwright file chooser before choosing Live2D, VRM, or MMD;
- correlates the import through the new IndexedDB model key;
- selects the imported card and waits for the main window selection to match;
- captures the main stage and removes the imported fixture afterward.

Treat the capture as failed when it still shows a preset model, an import dialog, a blank stage, or a loading state. Inspect every generated image.
