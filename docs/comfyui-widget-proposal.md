# ComfyUI Widget Proposal (CUIPP Edition)

This document outlines the specialized design and functionality for a ComfyUI-powered widget in the AIRI desktop app, targeting the **CUIPP (comfyGalleryAppBackend)** infrastructure.

## 1. Overview
The ComfyUI widget allows AIRI to visualize her imagination by triggering image generations. **Crucially, this system interacts exclusively with the `comfyGalleryAppBackend` (CUIPP) via a CLI-bridge, NOT directly with the native ComfyUI 8188 API.**

## 2. Core Functional Requirements

### A. History Carousel (Gallery)
- **Session History**: Maintains an array of generated images within the widget lifecycle.
- **Navigation**: Sleek chevron arrows (left/right) allow cycling through the history.
- **Looping**: Reaches the end of the history loops back to the beginning.

### B. Intelligent Loading State ("Spinning Sun")
- **Visual**: The `meteocons:clear-day-fill` icon spins as the "thinking" indicator.
- **Status Reporting**: Taps into the `CliExecutionManager.js` status events:
    - **Step Progress**: Real-time progress bar derived from `progress_state` events.
    - **Action Label**: Displays the current node activity (e.g., "Sampling...", "FaceSwapping...").
- **Transparency**: Shows the prompt being used while the generation is "in the reactor."

### C. Transition Animations
- **Carousel Shuffle**: When a new image is ready, the loading view dissolves or slides out as the new image takes center stage.
- **Interactive Peek**: Arrows might pulse or glow when a new image is added but not currently viewed.

### D. Flip-Card Metadata View
- 3D Y-axis rotation to show the "Technical Backside."
- **Data**: Displays the full prompt, remix ID (if applicable), render time, and engine stats.

## 3. Technical Integration Plan

### A. Backend Interface: The CLI Bridge
The widget subsystem communicates with the local CUIPP installation located at `E:\CUIPP\comfyGalleryAppBackend`.

**Direct CLI Commands (WSL/Node):**
- **Generate**: `node cli-agent.js generate --prompt "..."`
- **Remix**: `node cli-agent.js remix --targetId <ID> --prompt "..."`

**Target Modules:**
- `generate.js`: Used for fresh creations.
- `remix.js`: Used for modifying/improving previous generations.

### B. IPC Plumbing
1. **Renderer**: Sends a `spawn` or `update` request to the Main process.
2. **Main (Service)**: Spawns the CLI bridge using `child_process`.
3. **Event Stream**: Main listens to `stdout` from the CLI (which uses `CliExecutionManager`) and emits `widgetsUpdateEvent` to the Renderer to drive the UI progress/status.

## 4. LLM Prompting Strategy (Visual Cortex)
AIRI uses a specialized guidance block to interact with this system:

- **Planning Phase**: AIRI includes a code block: ` ```image_prompt [descriptors] ``` ` in her internal reasoning.
- **Response Phase**: AIRI ends her message with a **Photo Tag** (e.g., `📷 ✨ *masterpiece in progress*`).
- **Trigger**: The application detects these markers and automatically invokes the `stage_widgets` tool to spawn the ComfyUI widget.

## 5. Property Definition (KIS Mode)
To keep the initial phase simple, the widget property interface is restricted:

- `action`: "spawn" | "update"
- `id`: Unique generation ID (required for updates/remixes).
- `mode`: "generate" | "remix"
- `payload`:
    - For `generate`: `{ prompt: string }`
    - For `remix`: `{ remixId: number, prompt: string }`
