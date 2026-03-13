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

- **Transcription Feedback Toast**: Added a visual notification (toast) that shows "🎤 You said: <text>" after speech is transcribed. If no speech is detected, an error toast "STT: No speech detected" is shown to provide clear feedback.
- **Artistry System Refactor**: Moved Artistry configuration to a dedicated tab in the character card settings. Added a configurable "Widget Spawning Instruction" field that defaults to an optimized prompt for image generation. The system now automatically injects these instructions into the AI's system prompt when an Artistry provider is selected, ensuring the model knows how to use the widget system without manual prompt engineering.
- **Manual (Pure Mic) Mode**: Introduced a new "Detection Mode" setting in the Hearing module. Users can now choose between **VAD (Default)** and **Manual (Pure Mic)**. In Manual mode, automatic voice activity detection is bypassed, and recordings are triggered purely by manual microphone toggles (ScrollLock or UI), preventing premature cutoffs or VAD-related noise heuristics.
- **Heartbeats System (Proactivity)**: Initial implementation of the proactivity engine is in progress. This system allows AIRI to initiate conversations based on user activity and schedule. Current status: Core timing and basic gates are being refined.
- **Local Time Sensor**: Integrated localized time/timezone as a critical sensor metric for the Heartbeats system. This allows the AI to be aware of the user's current time (e.g., "It's 9 PM, maybe I should wrap up") when deciding to trigger a heartbeat.
- **LLM Log Cleanup**: Silenced verbose `[LLM Delta]` console logs and fixed a bug causing duplicate `[LLM Final Output]` logs in the terminal.
- **Workaround Documentation**: Added `// NOTICE:` comments throughout the codebase to explain critical hacks, OS-specific workarounds (like Electron main process logic), and upstream dependency fixes.

## Project Structure

- **Primary Workspace**: `airi-rebase-scratch`
    - A fork of the main project with rolled-in changes.
    - Connected to `dasilva333/airi` (main branch).
- **Staging/Clean Room**: `airi-clean-pr`
    - Used for isolating and preparing individual features into clean PR branches.

## Roadmap / Future Ideas

- **STT/TTS Chat Inscription**: Ensure that transcribed text from voice input is automatically inscribed in the chat history. Currently, these messages "get lost in the ether"; they should appear in the history as if they were manually typed by the user to maintain a complete conversation record even when using voice interaction.
- **Model Centering & Preview Cache**: Investigation into the image preview cache algorithm for when model files load. Some models are currently displayed way off-center (e.g., only head and neck visible at the bottom edge) during the initial load/render.
- **Configurable Global Hotkey**: Allow users to configure the global microphone toggle key from the settings panel. This would replace the current hardcoded ScrollLock logic (or make it optional), while potentially maintaining LED sync for toggle keys like CapsLock/NumLock. (Out of scope for current feature branch).
