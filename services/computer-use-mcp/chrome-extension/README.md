# AIRI Desktop Grounding — Chrome Extension

Chrome DOM observation and interaction bridge for the AIRI Desktop Grounding layer.

## What it does

- Collects interactive elements (buttons, links, inputs, etc.) from all frames in the active Chrome tab
- Reports element positions, ARIA roles, text, and rect coordinates
- Feeds this data into the desktop grounding snap resolver for coordinate mapping
- Performs targeted DOM interactions (set input values, check checkboxes, trigger events) when routed by the action executor

## What it does NOT do

- ❌ No `eval` / `new Function` / `chrome.scripting.executeScript`
- ❌ No external network requests (no Python bridge, no offscreen documents)
- ❌ No popup UI

Physical click/type/scroll actions are performed via real macOS OS-level input events (CGEvent) through the desktop grounding executor. DOM mutations are limited to form-field writes and synthetic event dispatch via the bridge.

## Architecture

```
background.js (Service Worker)
    ↕ chrome.tabs.sendMessage
msg_bridge.js (ISOLATED world)
    ↕ window.postMessage
content.js (MAIN world, window.__AIRI_DG__)
```

The background service worker also maintains a native WebSocket connection to `BrowserDomExtensionBridge` (default port 8765) to relay commands from the AIRI host process.

## Installation (development)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this `chrome-extension/` directory
5. The extension will auto-inject into all pages

## Supported commands

| Command | Description |
|---------|-------------|
| `getActiveTab` | Get active tab info (id, url, title) |
| `getAllFrames` | List all frames in active tab |
| `readAllFramesDOM` | Collect interactive elements from all frames |
| `findElement` | Find single element by CSS selector |
| `findElements` | Find multiple elements by CSS selector |
| `getClickTarget` | Get element center point for click targeting |
| `getElementAttributes` | Get all attributes of an element |
| `setInputValue` | Set value of a text input or textarea |
| `checkCheckbox` | Check or uncheck a native checkbox/radio |
| `selectOption` | Select an option in a `<select>` element |
| `readInputValue` | Read the current value of an input/textarea/select |
| `getComputedStyles` | Get computed CSS styles for an element |
| `triggerEvent` | Dispatch a DOM event on an element |
| `waitForElement` | Wait for an element to appear in the DOM |
| `clickAt` | Dispatch a click event at viewport coordinates |

## Provenance

Adapted from the upstream computer-use chrome-extension.
