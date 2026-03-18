# AIRI Progress Overview

This document tracks the current development state of the AIRI project, specifically within the `airi-rebase-scratch` workspace.

## Feature Branches

| Branch Name | Description | Status |
|-------------|-------------|--------|
| `feat/artistry` | AI-generated art and image generation features (e.g., DALL-E integration). | Active |
| `feat/control-islands-camera` | Enhanced camera controls and positioning for the application's scenes/islands. | Active |
| `feat/live2d-customizations-panel` | A dedicated settings panel for fine-tuning Live2D model behaviors and visuals. | Active |
| `feat/model-selector-redesign` | (PR #1297) Re-engineered model selector with categorized grouping and real-time validation. | Submitted |
| `feat/scrolllock-mic-toggle` | (PR #1298) Feature to toggle the microphone mute state using the ScrollLock key. | Submitted |
| `feat/speech-pipeline-stability` | (PR #1299) Improvements to the VAD and speech processing pipeline for better stability and lower latency. | Submitted |
| `feat/stt-feedback-log-cleanup` | (PR #1300) Visual STT feedback toasts and refined terminal logging. | Submitted |
| `feat/tray-position-startup-fix` | (PR #1289) Auto-restore window position from snapshot on startup. | Submitted |
| `feat/vrm-live2d-expressions-customizations` | Shared logic and UI for emotion/expression mapping across both VRM and Live2D models. | Active |
| `feat/artistry-enhancements` | Reorganizing Artistry UI and automating widget prompt injection. | Active |
| `feat/volume-sensor-integration` | Integrating system volume levels into the proactivity sensor suite. | Completed |

## Recent Changes (in `airi-rebase-scratch`)

### 2026-03-17 - Live2D Fixes, Churn Suppression & Tool-Aware Proactivity
- **Live2D 206 Fix**: Resolved critical `206 Partial Content` loading failure in `opfs-loader.ts` by normalizing responses into full `200` blobs.
- **Character Switcher Churn Fix**: Implemented **Identity Guards** in `index.vue` and the `airi-card` store. Redundant model reloads and "You selected..." toasts are now suppressed when character metadata updates without an actual model switch.
- **Improved Refresh Logic**: The Control Island's refresh button now triggers a **Forced Model Reload** via the store, allowing model resets without a full window reload.
- **Proactivity Tool Registration**: Implemented a dynamic tool registration system for the Heartbeats pipeline. The AI can now fetch and use contextually relevant tools (Volume, Time, etc.) during proactive evaluation.
- **DeepSeek/GLM-4.7 Support**: Added streaming support for `reasoning-delta` events and hardened the categorizer against malformed tag typos to prevent prompt stalls.
- **Selective Upstream Sync Audit**: Completed a thorough comparison against the March 15th upstream baseline (`65faf3f`). Confirmed upstream is primarily churn; integrated functional message-flattening logic into the fork.
- **System Volume Sensor**: Integrated a PowerShell-backed sensor for real-time volume levels in the proactivity payload.
- **Hotkey Persistence**: Fixed race condition where microphone toggle (e.g., Caps Lock) would reset to Scroll Lock.

### Prior Improvements
- **Dynamic AIRI Card Exports**: Session-aware snapshot system capturing outfits and expressions in real-time.
- **Expanded VRM Animation Library**: Increased library to 24 type-safe presets with standardized English naming.
- **Artistry System Refactor**: Moved configuration to character card settings with automated widget prompt injection.
- **Manual (Pure Mic) Mode**: Bypasses VAD for pure manual microphone triggering.
- **Heartbeats System (Proactivity)**: Restored proactivity UI and sensor-backed payload previews.

## Project Structure

- **Primary Workspace**: `airi-rebase-scratch`
  - Fork connected to `dasilva333/airi:main`. local branch `main`.
- **Staging/Clean Room**: `airi-clean-pr`
  - Used for isolating features into clean PR branches.

## Pending Items (Roadmap)
- **Model Centering**: Investigating off-center loading for VRM/Live2D.
- **VRM Idle Hairball**: Evolving static loops into dynamic weighted samplers.
- **Live2D ZIP Repackaging**: Intercepting oversized ZIP imports on the Electron side.
- **AIRI Card Export Preview Modes**: Explore an optional export mode that bakes the currently selected stage background into the composed PNG preview, while keeping the current transparent/framed export as the default. This should stay optional so card portability and predictable framing are not lost.
- **Character Photo Mode / Saved Shots**: Explore a lightweight "photo mode" for capturing stills of the current character pose/frame directly from stage. Initial scope should be simple one-click image capture and download; a later extension could allow cards to keep a preferred preview shot for export. Keep this intentionally small to avoid overengineering into a full screenshot studio too early.
- **Imported Card Customization Guidance**: Continue improving the onboarding/discovery copy around imported SillyTavern cards so users understand these are starter assets and still need AIRI-specific tuning, especially in the **Acting** tab to align expressions, speech tags, and motion cues with the currently selected VRM/Live2D model.
- **Bundled Scenic Background Starter Pack**: Evaluate shipping a curated set of roughly 8 default scenic backgrounds with the app so new installs have a stronger out-of-box Scene Manager experience. Current rough size is about 28 MB total, so the open question is whether these should be true built-in assets, optional downloadable content, or a smaller starter subset. Current source reference is the scenic PNG collection in `C:\Users\h4rdc\Documents\Github\coding-agent\VRMs`.
