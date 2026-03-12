# AIRI Progress Overview

This document tracks the current development state of the AIRI project, specifically focusing on standardized features being ported from development workspaces.

## Feature Branches

| Branch Name | Description | Status |
|-------------|-------------|--------|
| `feat/artistry` | AI-generated art and image generation features (e.g., DALL-E integration). | Active |
| `feat/control-islands-camera` | Enhanced camera controls and positioning for the application's scenes/islands. | Active |
| `feat/live2d-customizations-panel` | A dedicated settings panel for fine-tuning Live2D model behaviors and visuals. | Active |
| `feat/model-selector-redesign` | (PR #1297) Re-engineered model selector with categorized grouping and real-time validation. | Submitted |
| `feat/scrolllock-mic-toggle` | (PR #1298) Feature to toggle the microphone mute state using the ScrollLock key. | Submitted |
| `feat/speech-pipeline-stability` | (PR #1299) Improvements to the VAD and speech processing pipeline for better stability and lower latency. | Submitted |
| `feat/vrm-live2d-expressions-customizations` | Shared logic and UI for emotion/expression mapping across both VRM and Live2D models. | Active |
| `feat/stt-feedback-log-cleanup` | (PR #1300) implement stt feedback toasts and refined llm logging. | Submitted |
| `feat/tray-position-startup-fix` | Resolves issues with incorrect initial positioning of the system tray icon on launch. | Active |

## Recent Changes

- **Transcription Feedback Toast**: Added a visual notification (toast) that shows "🎤 You said: <text>" after speech is transcribed. If no speech is detected, an error toast "STT: No speech detected" is shown to provide clear feedback.
- **LLM Log Cleanup**: Silenced verbose `[LLM Delta]` console logs and fixed a bug causing duplicate `[LLM Final Output]` logs in the terminal.
- **Workaround Documentation**: Added `// NOTICE:` comments throughout the codebase to explain critical hacks, OS-specific workarounds, and upstream dependency fixes.

## Tooling

- **GitHub CLI**: Found at `C:\Program Files\GitHub CLI\gh.exe`. This is the primary tool for PR management. See [SUBMITTING_PRS.md](file:///c%3A/Users/h4rdc/Documents/Github/airi-clean-pr/docs/SUBMITTING_PRS.md) for usage instructions.

## Project Structure

- **Staging/Clean Room**: `airi-clean-pr`
    - Used for isolating and preparing individual features into clean PR branches.

## Roadmap / Future Ideas

- **STT/TTS Chat Inscription**: Ensure that transcribed text from voice input is automatically inscribed in the chat history. Currently, these messages "get lost in the ether"; they should appear in the history as if they were manually typed by the user to maintain a complete conversation record even when using voice interaction.
- **Model Centering & Preview Cache**: Investigation into the image preview cache algorithm for when model files load. Some models are currently displayed way off-center (e.g., only head and neck visible at the bottom edge) during the initial load/render.
- **Configurable Global Hotkey**: Allow users to configure the global microphone toggle key from the settings panel. This would replace the current hardcoded ScrollLock logic (or make it optional), while potentially maintaining LED sync for toggle keys like CapsLock/NumLock. (Out of scope for current feature branch).
