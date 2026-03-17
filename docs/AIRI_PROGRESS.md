### 2026-03-17 - Live2D Loading Fixes & Pipeline Robustness

- **Status**: ✅ Live2D Model loading restored across all environments
- **What worked**:
  - **Live2D 206 Fix**: Diagnosed a strict status check in `pixi-live2d-display` that caused crashes on `206 Partial Content` responses. Updated `opfs-loader.ts` to normalized these requests into full `200` blobs.
  - **Hotkey Persistence**: Fixed a race condition/initialization bug where the microphone toggle hotkey (e.g., Caps Lock) would reset to Scroll Lock. Refined `hearing.vue` with an `isFetched` guard.
  - **Bedrock Stability**: Added protective credential checks in the Amazon Bedrock provider to prevent application crashes when AWS keys are missing.
  - **Animation Cycler**: Integrated initial support for cycling through VRM/Live2D idle animations via the control island.

- **Status**: ✅ TTS audio routing operational
- **What worked**:
  - Found that `await getServerChannelConfig()` was hanging in `App.vue` `onMounted`.
  - Root cause was missing IPC service registrations in `main/index.ts` for Channel Server, MCP, and I18n.
  - Hoisting issue with `mainWindow` in `index.ts` was resolved by moving registrations into the `injeca.invoke` callback.
  - Build errors caused by missing exports and unused variables were resolved.

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
### 2026-03-17 - Live2D Loading Fixes & Pipeline Robustness

- **Status**: ✅ Live2D Model loading restored across all environments
- **What worked**:
  - **Live2D 206 Fix**: Diagnosed a strict status check in `pixi-live2d-display` that caused crashes on `206 Partial Content` responses. Updated `opfs-loader.ts` to normalized these requests into full `200` blobs.
  - **Hotkey Persistence**: Fixed a race condition/initialization bug where the microphone toggle hotkey (e.g., Caps Lock) would reset to Scroll Lock. Refined `hearing.vue` with an `isFetched` guard.
  - **Bedrock Stability**: Added protective credential checks in the Amazon Bedrock provider to prevent application crashes when AWS keys are missing.
  - **Animation Cycler**: Integrated initial support for cycling through VRM/Live2D idle animations via the control island.

- **Status**: ✅ TTS audio routing operational
- **What worked**:
  - Found that `await getServerChannelConfig()` was hanging in `App.vue` `onMounted`.
  - Root cause was missing IPC service registrations in `main/index.ts` for Channel Server, MCP, and I18n.
  - Hoisting issue with `mainWindow` in `index.ts` was resolved by moving registrations into the `injeca.invoke` callback.
  - Build errors caused by missing exports and unused variables were resolved.

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

## Recent Changes (in `airi-rebase-scratch`)
- **Live2D 206 Fix**: Resolved critical `206 Partial Content` loading failure in `opfs-loader.ts` by normalizing responses into full `200` blobs and adding robust guards for `blobUrl`.
- **Hotkey Persistence**: Fixed race condition where microphone toggle (e.g., Caps Lock) would reset to Scroll Lock; added `isFetched` guard to renderer state.
- **Bedrock Stability**: Hardened Amazon Bedrock provider to prevent application crashes when AWS credentials are missing.
- **Microphone Quality / Crackling Audio**: Resolved hardware-specific audio artifacts that previously blocked pipeline stability improvements.
- **Control Island Animation Cycler**: Integrated initial support for cycling through VRM/Live2D idle animations directly from the stage view controls.
- **Chat Response UI Synchronization (FIXED)**: Resolved a critical issue where chat responses were being lost or remained empty. This involved:
  - Adding direct support for the `reasoning-delta` event type (used by models like `glm-4.7`).
  - Implementing an end-of-stream synchronization step in `onEnd` to force-commit speech content if the streaming categorizer was stalling on unclosed tags.
  - Refining the categorizer's "incomplete tag" detection to prevent it from stalling on non-tag characters like `<`.
- **Dynamic AIRI Card Exports (Phase 2 Complete)**: Implemented a session-aware snapshot system for AIRI card exports. It now captures the model's active state (outfits and expressions) in real-time. Added full support for both local files and URL/Preset models (e.g., Lain), ensuring consistency across all character types.
- **Expanded VRM Animation Library**: Increased the library of built-in `.vrma` presets from 11 to 24. This included translating and cleaning several Japanese/garbled filenames into a standardized English underscore format (e.g., `ai_cat_dance`, `humans_are_just_cylinders`, `hito_mania`). All 24 animations are now type-safe and available in the animation registry.
- **Transcription Feedback Toast**: Added a visual notification (toast) that shows "🎤 You said: <text>" after speech is transcribed. If no speech is detected, an error toast "STT: No speech detected" is shown to provide clear feedback.
- **Artistry System Refactor**: Moved Artistry configuration to a dedicated tab in the character card settings. Added a configurable "Widget Spawning Instruction" field that defaults to an optimized prompt for image generation. The system now automatically injects these instructions into the AI's system prompt when an Artistry provider is selected, ensuring the model knows how to use the widget system without manual prompt engineering.
- **Manual (Pure Mic) Mode**: Introduced a new "Detection Mode" setting in the Hearing module. Users can now choose between **VAD (Default)** and **Manual (Pure Mic)**. In Manual mode, automatic voice activity detection is bypassed, and recordings are triggered purely by manual microphone toggles (ScrollLock or UI), preventing premature cutoffs or VAD-related noise heuristics.
- **Heartbeats System (Proactivity)**: Restored the richer proactivity UI, sensor-backed sample payload preview, and supporting metrics/context plumbing.
- **Local Time Sensor**: Integrated localized time/timezone as a critical sensor metric for the Heartbeats system. This allows the AI to be aware of the user's current time (e.g., "It's 9 PM, maybe I should wrap up") when deciding to trigger a heartbeat.
- **LLM Log Cleanup**: Silenced verbose `[LLM Delta]` console logs and fixed a bug causing duplicate `[LLM Final Output]` logs in the terminal.
- **AIRI Card / Profile Switching Restoration**: Restored flip cards, card model previews, profile-switcher model switching, modules/proactivity tab layout regressions, and VRM zoom persistence across restarts.
- **Chatterbox Provider Studio**: Shipped a first-class Chatterbox provider UI plus preset/profile CRUD, with a dedicated AIRI management studio and matching server-side endpoints in the Chatterbox fork.
- **Privacy / Local-Only Mode**: Remote auth bootstrap and cloud chat sync are now disabled by default. AIRI only contacts `airi-api.moeru.ai` after the user explicitly enables cloud sync in settings.
- **Discord Bot Bring-up Stabilization**: Fixed a local dev regression where the standalone Discord bot could not connect because the AIRI channel server was incorrectly inheriting the renderer dev port. The channel server now keeps its own port and the duplicate-reply issue did not reproduce after the fix.
- **Proactivity Metrics & Window History Overhaul**: Replaced the unreliable manual counters with a real-time metrics engine that derives TTS, STT, and Chat counts directly from the chat session history. Expanded the focus history to include the last 6 entries with explicit labeling for the "Active Program" and "Active Window Title" to improve LLM reasoning.
- **Server Communication Log Refinement**: Fine-tuned the `@proj-airi/server-runtime:websocket` logs to suppress massive chat completion text dumps (`output:gen-ai:chat:complete`) by downgrading them to debug levels, while maintaining the visibility of system heartbeat events for health monitoring.
- **Workaround Documentation**: Added `// NOTICE:` comments throughout the codebase to explain critical hacks, OS-specific workarounds, and upstream dependency fixes.

## Project Structure

- **Primary Workspace**: `airi-rebase-scratch`
  - A fork of the main project with rolled-in changes.
  - Connected to `dasilva333/airi` (`main` branch).
  - Must remain checked out on local branch `main`.
  - Must not be used for temporary branches, rebases, conflict-resolution experiments, or staging work.
  - The only acceptable movement in this repo is advancing the tested live line after validation elsewhere.
- **Staging/Clean Room**: `airi-clean-pr`
  - Used for isolating and preparing individual features into clean PR branches.
  - This is the correct place for temporary branches, upstream sync experiments, and conflict work.
- **Upstream Squat Backlog**: See `docs/UPSTREAM_SQUAT_CANDIDATES.md`
  - Tracks open upstream PRs worth integrating into the fork and documents current priority/risk decisions.

## Pending Items (Roadmap)

### 🟡 Medium (Sensor & Render Integration)
- **Model Centering & Preview Cache**: Investigating why some models (like VRM/Live2D) load off-center. This involves diving into the bounding box and camera initialization logic in the renderer.
- **Sensor-Driven NO_REPLY & Volume Context**: Integrating system output volume and mic levels into the proactivity payload. This allows the AI (like Lain) to smartly decide to be silent if your volume is muted or the environment is noisy.
- **Malformed Prompt Stall (Ina vs Lain)**: Fix the `llm-marker-parser` infinite loop when encountering typos in character prompts (e.g., `<|ACT...}>`). Needs stashed synchronization logic fully integrated.

### 🔴 Hard / Complex (Core Systems & Performance)
- **VRM Animation Ecosystem (The "Idle Hairball")**: Evolving the static idle loop into a dynamic weighted sampler (shifting weight, blinking, breathing) that gracefully yields to AI-driven performance tokens (`|ACT...|`).
- **Live2D ZIP Repackaging (WASM Optimization)**: Building an Electron-side flow to intercept oversized ZIP imports and downscale them before they hit browser/WASM memory limits.

### 🟢 Maintenance & Extras
- **Configurable Global Hotkey**: Allow users to configure the global microphone toggle key from the settings panel (currently ScrollLock).
- **Enhanced Tray Context Menu**: Add more granular module controls to the system tray.
