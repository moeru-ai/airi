# AIRI Widget System Report

This document explains the "Missing widget id" error and the plumbing that allows the LLM to "compose" widget views within the AIRI ecosystem.

## 1. The "Missing widget id" Mystery
The error message `Missing widget id. Launch the window via a component call to populate this view.` is the intended behavior for an **uninitialized widget container**.

*   **Location**: `apps/stage-tamagotchi/src/renderer/pages/widgets.vue`
*   **The Cause**: When you click "Open Widgets" in the system tray, it opens the generic `/widgets` URL. The container is designed to render *specific instances* of widgets based on a unique ID (e.g., `/widgets?id=weather-123`). Without that ID, it doesn't know what data to display.

## 2. The Internal "Plumbing"
The system follows a **Tool -> IPC -> Manager -> Renderer** flow:

1.  **The LLM Tool (`stage_widgets`)**:
    - Defined in `apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.ts`.
    - Allows the LLM to `spawn`, `update`, `remove`, or `clear` widgets.
2.  **The Main Process Manager**:
    - `setupWidgetsWindowManager` in `src/main/windows/widgets/index.ts` manages a Map of active widget "Snapshots."
3.  **The Data Bridge**:
    - When a widget is spawned, the manager opens a new window with a query parameter: `?id=XYZ`.
    - The renderer uses this ID to "fetch" the props (data) from the main process.

## 3. How "Composition" Works
"Composing a view" in this architecture refers to **Dynamic Prop Mapping**:

*   **Pre-defined Widgets**: The system has a **Registry** of high-quality Vue components (currently `weather` and `map`).
*   **Property Mapping**: The LLM provides a `componentName` and a JSON blob of `componentProps`.
*   **The Power**: The LLM "defines" the view by providing the values that the `Weather.vue` component uses (temperature, city, conditions).
*   **The Secret "Secret" (JSON Fallback)**: If the LLM asks for a component that *doesn't exist* (e.g., `componentName: "MyBankBalance"`), the system doesn't crash. It falls back to a **`GenericWidget`**, which renders the JSON data as a beautiful, styled info-card.

> [!TIP]
> This is how the LLM can "compose" a view for anything—stocks, news, or notes—even if there isn't a custom UI component for it yet.

## 4. How to Invoke the "Powers"
In the Tamagotchi app, the `stage_widgets` tool is actively passed to AIRI. You can test it by asking her:

> *"AIRI, can you spawn a weather widget for Tokyo and set the temp to 78?"*

### Example Tool Call Structure:
```json
{
  "action": "spawn",
  "componentName": "weather",
  "componentProps": "{\"city\": \"Tokyo\", \"temperature\": \"78°F\", \"condition\": \"Sunny\"}",
  "size": "m",
  "ttlSeconds": 300
}
```

## 5. LLM Prompting Guidelines
To ensure the LLM uses these powers correctly, the following instructions should be included in its system prompt or character card:

### Widget Controls
- **Never write raw HTML** for widgets. Always use the `stage_widgets` tool.
- **Weather Properties**: Use `city`, `temperature` (not `temp`), `condition`, `wind`, `humidity`, and `precipitation`.
- **Map Properties**: Use `title`, `eta`, `distance`, `mode`, `originLabel`, and `destinationLabel`.
- **Persistence**: Use `ttlSeconds: 0` for permanent displays or `300` for temporary info.
- **ID Management**: Always provide a descriptive `id` (e.g., `weather-tokyo`) so you can update the same widget later using the `update` action instead of spawning duplicates.

### "Composition" Strategy
If a specific component doesn't exist, use a descriptive `componentName` and pass all data into `componentProps`. The system will automatically generate a styled JSON info-card.

## 6. Current File Map (2026 Fork Layout)
The widget system now spans both the generic widget shell and the specialized artistry/image-generation pipeline:

- **Renderer Tool Entry**: `apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.ts`
  - Defines the `stage_widgets` tool AIRI calls.
  - Normalizes `spawn` and `update` payloads before they cross into the main process.
- **Renderer Widget Window**: `apps/stage-tamagotchi/src/renderer/pages/widgets.vue`
  - Fetches a widget snapshot by `id`.
  - Merges live `widgetsUpdateEvent` payloads into the open widget instance.
- **Renderer Image Widget Components**:
  - `apps/stage-tamagotchi/src/renderer/widgets/artistry/components/Comfy.vue`
  - `apps/stage-tamagotchi/src/renderer/widgets/comfy/components/Comfy.vue`
  - These handle the visual gallery/history layer, loading overlays, and prompt metadata.
- **Main Widgets Window Manager**: `apps/stage-tamagotchi/src/main/windows/widgets/index.ts`
  - Owns the authoritative in-memory widget snapshot `Map`.
  - Emits `widgetsRenderEvent`, `widgetsUpdateEvent`, `widgetsRemoveEvent`, and `widgetsClearEvent`.
- **Main Artistry Bridge**: `apps/stage-tamagotchi/src/main/services/airi/widgets/artistry-bridge.ts`
  - Intercepts widget generations.
  - Dispatches to the active image provider.
  - This is the real bridge for the current `artistry` widget pipeline.
- **Providers**:
  - `apps/stage-tamagotchi/src/main/services/airi/widgets/providers/replicate.ts`
  - `apps/stage-tamagotchi/src/main/services/airi/widgets/providers/comfyui.ts`
- **Legacy / Proof-of-Concept CUIPP Bridge**:
  - `apps/stage-tamagotchi/src/main/services/airi/widgets/cuipp.ts`
  - This should be treated as exploratory bridge code, not the final architecture.

## 7. Current Limitation: Widgets Are Too Ephemeral
The current architecture still treats a widget as both:

1. the **live surface** where generation happens
2. the **only owner** of image history

That is why history behavior keeps feeling brittle. Once a widget is replaced, removed, or superseded by a later run, the generated image history becomes hard to reason about. The widget should really be a **viewport**, not the long-term source of truth.

## 8. Planned Direction: `image_journal`
The current conclusion is that generated art should stop being modeled as a fragile `stage_widgets` lifecycle problem and instead become a dedicated first-class feature called `image_journal`.

Important constraints for this redesign:

- keep the current **carousel** UI metaphor
- do **not** invent separate AI-facing browse/list/show/delete concepts
- do **not** force the model to manage widget ids
- do **not** split the feature into a separate "live panel" and "journal" product surface

The journal itself should be the persistent carousel. New images simply append to that surface over time.

## 9. Proposed `image_journal` MVP
The first version should stay very small and very opinionated:

- `create`
  - required fields: `title`, `prompt`
  - routes through the provider's normal create/generate method
  - appends the finished image to the persistent carousel
- `set_as_background`
  - promotes the currently focused journal image into the stage background system

Why this is the right MVP:

- it removes brittle widget lifecycle/id management from the model-facing flow
- it preserves the existing successful carousel interaction pattern
- it adds a new user-facing capability instead of only rebuilding storage under the hood

## 10. Titles, Slugs, and Future Interactions
The LLM should provide a **human-readable title** as part of image creation.

The app should then:

- sanitize the title
- slugify it for storage
- dedupe it automatically when needed

This is preferable to UUID-based interactions. Human-readable labels make it possible to support richer future workflows without forcing the model or the user to think in terms of opaque ids.

## 11. Storage Direction
`localStorage` is not suitable for this feature.

The durable shape should be:

- persistent journal metadata
- real file/blob-backed image storage
- optional per-character association so generated art can become a character picture book over time

The key architectural point is that the **journal becomes the source of truth**, while the carousel UI is simply the way that truth is presented.

## 12. CUIPP Future Scope
If CUIPP is ever extracted into something open and reusable, the scope should be **MVP-first**:

- do **not** try to port the whole CUIPP app
- do extract a minimal standalone generation worker
- the first contract should be:
  - prompt in
  - optional remix/source id
  - progress/status events out
  - final asset path or URL out

`remix` should be treated as a CUIPP-first capability that can later expand to other providers, not as something every provider must support on day one.
