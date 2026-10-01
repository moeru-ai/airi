# AIRI Plugin - Web Extension

> Read what you are reading!

This is a plugin for the AIRI to understand what you are reading, looking at, or listening to on the web.

## What it does now

- Captures page + video context from YouTube and Bilibili.
- Extracts subtitles from text tracks or DOM overlays.
- Sends context updates and optional `spark:notify` events to the character.
- Exposes a popup to configure WebSocket, toggles, and quick status.

## Observation ownership

Page, video, and subtitle updates replace the fixed `web:page`, `web:video`, and `web:subtitle` slots.
Each text uses the shared 80-token budget. Oversized text becomes a `web-extension:context` reference to its slot.
The latest full payload remains in `ClientState.lastPage`, `lastVideo`, or `lastSubtitle` until replacement or background restart.
These references identify current module state. They do not grant access. A host read returns the slot's full text only to the requesting connection.
The connection announces an extension module identity, as required by the Server SDK handshake.

## Quick start

1. `pnpm -F @proj-airi/airi-plugin-web-extension dev`
2. Load the unpacked extension from `.wxt/dev` in your browser.
3. Open the popup to set the WebSocket URL (default: `ws://localhost:6121/ws`).
4. Watch a YouTube/Bilibili video and confirm the popup shows the detected title/subtitle.
