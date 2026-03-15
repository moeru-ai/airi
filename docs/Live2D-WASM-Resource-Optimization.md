# Systems Design: Live2D WASM & Resource Optimization (The "Repackage" Flow)

## 1. Overview
This document outlines the architecture for handling oversized Live2D character models within the AIRI (Electron/Web) environment. It addresses the fundamental performance and memory constraints of WebAssembly (WASM) when dealing with high-resolution texture atlases.

## 2. The Problem: The "WASM Wall"
Large Live2D models often exceed the memory thresholds of browser-based WASM implementations.
*   **Texture Overload**: Ultimate/Premium models frequently use 4K or 8K texture atlases. A single 4K texture requires ~64MB of uncompressed VRAM.
*   **WASM Heap Limits**: Browser WASM instances have fixed heap size limits (often 2GB or less). Initialization of massive models can cause total application crashes or significant UI thread "jank."
*   **Widget Paradigm**: As a desktop widget, AIRI must maintain a minimal resource footprint. Running "gaming-tier" assets in a 2D widget is architecturally inappropriate.

---

## 3. Proposed Solution: The "Repackage" Strategy
Instead of attempting further browser-side optimizations, AIRI will implement an **Asset Repackaging Pipeline** that leverages the Electron Main process to downscale assets before they reach the renderer.

### A. Detection Logic
Upon model import (ZIP drop), the renderer performs a "Pre-flight Check":
*   Scans the ZIP for total size and texture atlas resolutions.
*   **Thresholds**: Triggers when ZIP > 50MB or any texture > 2048px.

### B. User Intervention Modal
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

## 5. Architectural Benefits
1.  **Deterministic Performance**: Guarantees that even "heavy" models will run smoothly on average hardware.
2.  **Transparency**: Educates the user on the relationship between asset size and system performance.
3.  **Stability**: Moves the riskiest operations (unzipping and image processing) out of the browser/renderer thread and into a controlled Node.js environment.

## 6. Verification Metrics
*   **Memory Pressure**: Measure the difference in WASM heap usage between raw and optimized versions.
*   **Initialization Time**: Time-to-first-render should decrease by > 50% for 4K models.
*   **Visual Fidelity**: Verify that 1024px atlases provide sufficient detail for standard widget sizes.
