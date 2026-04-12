# AIRI Desktop Grounding — Chrome Extension

Read-only Chrome DOM observation bridge for the AIRI Desktop Grounding layer.

## What it does

- Collects interactive elements (buttons, links, inputs, etc.) from all frames in the active Chrome tab
- Reports element positions, ARIA roles, text, and rect coordinates
- Feeds this data into the desktop grounding snap resolver for coordinate mapping

## What it does NOT do

- ❌ No DOM mutations (no clicking, typing, scrolling on DOM elements)
- ❌ No `eval` / `new Function` / `chrome.scripting.executeScript`
- ❌ No external network requests (no Python bridge, no offscreen documents)
- ❌ No popup UI

All user interactions are performed via real macOS OS-level input events (CGEvent) through the desktop grounding executor.

## Architecture

```
background.js (Service Worker)
    ↕ chrome.tabs.sendMessage
msg_bridge.js (ISOLATED world)
    ↕ window.postMessage
content.js (MAIN world, window.__AIRI_DG__)
```

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

## Provenance

Adapted from `/Users/liuziheng/computer_use/chrome-extension/` with DOM-action methods stripped.
