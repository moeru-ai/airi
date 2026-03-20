# Systems Design: Live2D WASM & Resource Optimization

## 1. Overview
This document outlines the architecture for handling oversized Live2D character models within the AIRI Electron/Web environment. It addresses the fundamental performance and memory constraints of WebAssembly (WASM) when dealing with large Cubism assets, especially high-resolution texture atlases and heavyweight runtime data.

## 2. The Problem: The "WASM Wall"
Large Live2D models often exceed the memory thresholds of browser-based WASM implementations.
*   **Texture Overload**: Ultimate/Premium models frequently use 4K or 8K texture atlases. A single 4K texture requires ~64MB of uncompressed VRAM.
*   **WASM Heap Limits**: Browser WASM instances have fixed heap size limits (often 2GB or less). Initialization of massive models can cause total application crashes or significant UI thread "jank."
*   **Renderer Ceiling**: Even inside Electron, the Live2D runtime still ultimately lives inside a Chromium renderer process. Moving ZIP parsing or image resizing into Electron Main helps import-time work, but it does not remove the renderer's runtime memory ceiling once the model is actually loaded.
*   **Widget Paradigm**: As a desktop widget, AIRI must maintain a minimal resource footprint. Running "gaming-tier" assets in a 2D widget is architecturally inappropriate.

---

## 3. Two Possible Paths
There are really two different strategies here, and they solve different layers of the problem.

### Path A. Repackage What The Browser Can Realistically Handle
Instead of attempting increasingly fragile browser-side tricks, AIRI can implement an **Asset Repackaging Pipeline** that leverages the Electron Main process to downscale assets before they reach the renderer.

#### Detection Logic
Upon model import (ZIP drop), the renderer performs a "Pre-flight Check":
*   Scans the ZIP for total size and texture atlas resolutions.
*   **Thresholds**: Triggers when ZIP > 50MB or any texture > 2048px.

#### User Intervention Modal
If a threshold is hit, the user is presented with a **Resource Advisory**:
> **Large File Limit Exceeded**
> This model exceeds performance thresholds for browser technology. You may experience degradation or crashes.
> 1. **Continue Anyway**: Load as-is (at user's risk).
> 2. **Repackage (Recommended)**: Optimize textures for better performance.
> 3. **Abort**: Cancel import.

---

## 4. Implementation Details: `AssetPipelineService`

### A. Backend Execution (Electron Main)
The heavy lifting is offloaded to a dedicated service in the Node.js main process.
*   **Extraction**: Use `adm-zip` or `node-stream-zip` to extract the model to a temporary directory.
*   **Texture Optimization**: Use `sharp` to process all identified texture atlases.
    *   **Strategy**: Resize textures to a max-width of 1024px (standard widget-res) or 2048px (high-res) while maintaining aspect ratio.
    *   *Note: Because Live2D uses UV mapping within the atlas, proportional resizing preserves all coordinates.*
*   **Re-zipping**: Compress the folder back into a `[model]_optimized.zip`.

### B. Frontend Handoff
*   The optimized ZIP is either offered as a download back to the user or automatically moved to the AIRI internal library for hot-reloading.

---

## 5. What Repackaging Can And Cannot Solve
Repackaging is useful, but it is not magic.

### What It Can Solve
1.  **Deterministic Performance**: Guarantees that even "heavy" models will run smoothly on average hardware.
2.  **Transparency**: Educates the user on the relationship between asset size and system performance.
3.  **Stability**: Moves the riskiest operations (unzipping and image processing) out of the browser/renderer thread and into a controlled Node.js environment.

### What It Cannot Solve
1.  **No Unlimited Model Support**: If the runtime-side Live2D data is still too large for the Chromium/WASM renderer, repackaging textures alone does not remove that ceiling.
2.  **No True Chunked Runtime Loading**: Cubism model loading is not naturally shaped like a streamable open-world asset system. AIRI cannot trivially "page in" tiny chunks of a model the way a game engine might page terrain or world cells.
3.  **No Mesh Simplification Shortcut**: AIRI does not currently own a straightforward way to reduce the underlying Live2D model complexity itself during import. In practice, the easiest safe knob is still texture pressure.

---

## 6. Path B: Native Renderer Escape Hatch
If the goal ever becomes "support the heaviest possible Live2D assets, even when the Chromium/WASM renderer taps out," then the real answer may be a **native runtime path**, not more browser optimization.

That would mean:
*   Keep Electron for shell, windows, settings, IPC, and AIRI orchestration.
*   Move the avatar rendering path into a native sidecar/runtime with its own memory model.
*   Treat Tamagotchi as a hybrid system where UI remains Electron, but the heavy avatar renderer no longer depends on the browser WASM ceiling.

Possible shapes:
*   A native Cubism renderer hosted in a dedicated process and embedded into the desktop surface.
*   A separate lightweight companion runtime for desktop avatar rendering only.
*   A more ambitious forked "studio" runtime that preserves AIRI logic but swaps out the browser-bound Live2D rendering path.

### Why This Matters
This is the only path that plausibly moves AIRI from "optimize oversized models so some of them fit" to "support practically any model the user's hardware can handle."

### Why This Is Not The Default Plan
This would be a major architectural departure:
*   larger maintenance burden
*   more platform-specific code
*   more packaging complexity
*   less parity with the web/browser path

So the practical rule is:
*   **Repackage** when the problem is mostly texture pressure and import-time waste.
*   **Consider a native renderer** only when the real blocker is the Chromium/WASM runtime ceiling itself.

## 7. Verification Metrics
*   **Memory Pressure**: Measure the difference in WASM heap usage between raw and optimized versions.
*   **Initialization Time**: Time-to-first-render should decrease by > 50% for 4K models.
*   **Visual Fidelity**: Verify that 1024px atlases provide sufficient detail for standard widget sizes.
*   **Escalation Trigger**: Track how many real-world models still fail after repackaging. If too many premium models remain unusable, the native-renderer path becomes easier to justify.
