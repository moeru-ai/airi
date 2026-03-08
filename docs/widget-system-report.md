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
