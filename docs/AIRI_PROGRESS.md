### 2026-03-14 - TTS Routing Fixed & Core IPC Restored

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

## Roadmap / Future Ideas
### 2026-03-14 - TTS Routing Fixed & Core IPC Restored

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

## Roadmap / Future Ideas

- **Model Centering & Preview Cache**: Investigation into the image preview cache algorithm for when model files load. Some models are currently displayed way off-center (e.g., only head and neck visible at the bottom edge) during the initial load/render.
- **Live2D ZIP Repackaging / WASM Memory Limits**: Oversized Live2D ZIP imports need a pre-flight check plus optional Electron-side "repackage" flow to downscale atlases before the renderer hits browser/WASM memory limits. See `docs/Live2D-WASM-Resource-Optimization.md`.

## Ongoing Issues / Regressions

- **Chat Response UI Synchronization (FIXED)**: Resolved a critical issue where chat responses were being lost or remained empty. This involved:
  - Adding direct support for the `reasoning-delta` event type (used by models like `glm-4.7`).
  - Implementing an end-of-stream synchronization step in `onEnd` to force-commit speech content if the streaming categorizer was stalling on unclosed tags.
  - Refining the categorizer's "incomplete tag" detection to prevent it from stalling on non-tag characters like `<`.

- **Configurable Global Hotkey**: Allow users to configure the global microphone toggle key from the settings panel. This would replace the current hardcoded ScrollLock logic (or make it optional), while potentially maintaining LED sync for toggle keys like CapsLock/NumLock.
- **Microphone Quality / Crackly Audio Investigation**: Re-open investigation around the unresolved local crackly-audio issue that blocked PR `#1299` (`feat/speech-pipeline-stability`). The pipeline fixes themselves look promising, but they still need validation on the affected hardware/setup before that work is ready to upstream cleanly.
- **Sensor-Driven `NO_REPLY` & Volume Context**: Integrate system output volume and microphone levels as part of the core proactivity sensor payload. This will allow persona-specific prompt crafting (like for Lain) where the AI can intelligently decide to output `NO_REPLY` if the user's volume is muted or they are clearly in a noisy environment where they wouldn't want to be interrupted.
- **VRM Animation Ecosystem (The "Idle Hairball")**: Evolving the single-loop idle system into a dynamic, weighted "Idle Sampler" that can cycle through behaviors (innocent, shy, etc.) and gracefully yield to AI-triggered performances (ACT tokens).
