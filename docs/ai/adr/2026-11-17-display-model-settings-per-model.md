# Display model settings belong to the model

Status: proposed

## Context

`docs/ai/adr/2026-11-13-chat-selects-character.md` makes the chat select the character. The character selects its display model.

The settings of a display model did not follow this chain. Each renderer stored one value for each setting in local storage, for example `settings/live2d/scale`. About 80 keys had this shape, in five renderers: Live2D, VRM (Three.js), MMD, Spine, and Tachie.

- A change of character changed the model. The position, the motion map, and the lights stayed from the model before.
- A user who adjusted one model lost the adjustment of another model of the same renderer.
- The VRM store reset its view when the model changed (`lastModelId`). A return to the first model did not restore its view.

Facts that limit the design:

- Each renderer package reads its settings from module-level refs. Components, render loops, and settings panels read these refs directly.
- The renderer packages depend on `stage-shared`. They do not depend on `stage-ui`, which knows the selected model.
- The selected model is one synchronized value. Each window loads it in `loadStageModel` in `stores/settings/stage-model.ts`.

## Decision

### One value for each model

- A setting that describes a model is stored at `settings/models/<model id>/<renderer>/<name>`.
- `useModelScopedLocalStorage` and `useModelScopedLocalStorageManualReset` in `stage-shared` return a ref for such a setting. The storage key of the ref follows the active model of its renderer.
- The refs keep their names and their types. No reader changes.
- `loadStageModel` selects the active model of a renderer before it publishes the model to the renderer.
- Each renderer has its own active model. A Live2D model that becomes active does not change the settings of the last VRM model.

### Settings of the model and settings of the device

- Position, scale, rotation, camera, lights, environment, motions, expressions, parameters, physics, and materials belong to the model.
- A frame rate limit, a render scale, and multisampling belong to the device. They stay at their unscoped keys.

### Values from releases before this change

- The first model of a renderer that becomes active takes the values from the unscoped keys. The unscoped keys are removed.
- Later models start from the defaults.
- While no model of a renderer was active in a window, the refs read the unscoped keys.

### A deleted model

- When a model is deleted from the device and the account, its settings are removed.
- When a model stays in the account, its settings stay on the device. The model can be downloaded again.

## Not decided

- A value of one character for one model. Two characters that use the same model share its settings. The resource library project owns this.
- Synchronization of model settings with the account. They stay on the device.
- The two Live2D blink settings that use versioned storage (`auto-blink-enabled`, `force-auto-blink-enabled`) stay unscoped. The versioned storage function has no model scope.

## Consequences

- A change of character restores the settings of its model.
- The settings pages need no change. They edit the settings of the selected model.
- Local storage holds one group of keys for each model that was active on the device.
