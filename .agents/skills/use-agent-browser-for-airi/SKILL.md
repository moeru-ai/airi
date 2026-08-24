---
name: use-agent-browser-for-airi
description: Test AIRI display-model imports with agent-browser across stage-tamagotchi Electron, stage-web, and stage-pocket mobile web layouts. Use when uploading and verifying contributor-supplied Live2D ZIP, VRM, or MMD ZIP/PMX/PMD files through AIRI's model selector, including onboarding bypass, format-specific import behavior, renderer verification, and mobile-platform coverage decisions.
---

# Use Agent Browser for AIRI

Invoke `$agent-browser` and `$use-agent-browser-with-input-file`. The input-file skill owns file-input discovery, temporary instrumentation, upload commands, and generic post-upload verification. Run `agent-browser skills get core --full` before browser commands. For Electron, also invoke `$agent-browser-electron` and run `agent-browser skills get electron --full`.

Select the runtime guide:

- Electron stage-tamagotchi: read [references/electron.md](references/electron.md).
- stage-web: read [references/web.md](references/web.md).
- stage-pocket and mobile coverage: read [references/mobile.md](references/mobile.md).

## Model import contract

Use an absolute input path. AIRI currently creates each format input with VueUse `useFileDialog` and keeps it detached from the DOM, so all three formats use the [detached-input method](../use-agent-browser-with-input-file/references/detached-input.md). Apply that method before clicking the format menu item, then use the matching selector and format-specific postcondition:

| Format | Menu item | Input selector | Format-specific result |
| --- | --- | --- | --- |
| Live2D | `Live2D` | `input[data-agent-browser-upload][accept=".zip"]` | Inspect the validation report and click `Confirm` only when import is permitted. |
| VRM | `VRM` | `input[data-agent-browser-upload][accept=".vrm"]` | Wait for the imported card; no Live2D validation confirmation is expected. |
| MMD | `MMD` | `input[data-agent-browser-upload][accept=".zip,.pmx,.pmd"]` | Verify archive/model storage separately from textures, physics, dynamic imports, and rendering. |

Resolve local Live2D and VRM fixtures from the paths documented by `$use-vishot-for-airi`. For MMD, use a licensed archive containing the model and its texture directories. Do not encode a contributor's private fixture name in tests or source comments.

## Prepare AIRI state

Use a fresh browser session or a dedicated Electron user-data directory. Mark onboarding complete before opening the model settings route:

```bash
agent-browser eval 'localStorage.setItem("onboarding/completed", "true"); localStorage.setItem("onboarding/skipped", "false"); location.reload(); true'
```

Open `/settings/models`, click `Select model`, and snapshot again.

## Import the model

1. Click the first `Options for Display Models` button.
2. Re-snapshot and click the exact Live2D, VRM, or MMD menu item.
3. Upload with the matching selector from the table by following `$use-agent-browser-with-input-file`'s detached-input method.
4. Re-snapshot. If Live2D validation displays a report, inspect it and click `Confirm` only when the report permits import.
5. Wait for the exact basename to appear on an imported model card with its own `Pick` button. The detached input's displayed filename is not sufficient.
6. Click that imported card's `Pick` button.
7. Restore the detached-input bridge after the change handler completes when the page will remain open.

## Verify the result

Require all of these postconditions:

1. `localStorage.getItem("settings/stage/model")` starts with `display-model-` after `Pick`.
2. The final stage shows the imported model rather than a preset, blank canvas, loading state, or import dialog.
3. A screenshot visually matches the format and fixture that was uploaded.
4. `agent-browser errors` contains no model-load failure.
5. `agent-browser console` contains no relevant Live2D, VRM, MMD, ZIP, texture, physics, or dynamic-import failure.

Do not infer the selected display model from the AIRI card/profile dropdown in the header; it identifies the active character card and may retain a different label.

Treat upload, persistence, and rendering as separate checkpoints. A visible imported card proves only that storage succeeded.

## Close and report

Close agent-browser sessions. Stop processes started for the test and remove only the dedicated temporary Electron user-data directory. Report each format and runtime separately as passed, failed, or not runnable, with the first failing checkpoint and relevant console error.
