# AIRI Project State & Progress

## Project Overview
- **Project Name**: AIRI ([moeru-ai/airi](https://github.com/moeru-ai/airi))
- **Primary Workspace**: `airi-rebase-scratch` (c:\Users\h4rdc\Documents\Github\airi-rebase-scratch)
    - This is a fork of the main project with all rolled-in changes.
    - Connected to `dasilva333/airi` (main branch).
- **Staging/Clean Room**: `airi-clean-pr`
    - Used for submitting clean PRs by porting changes from the rollup repo.
- **Unused/Reference**: `airi` folder (Do not touch).

## Completed & Active Feature Branches

### 1. Model Selector Redesign & Live2D Validation
- **Branch**: `feat/model-selector-redesign` (PR #1297)
- **Description**: Significant overhaul of the model selection interface for improved user experience.
- **Key Changes**:
    - Redesigned card-based model selector UI.
    - Added Live2D model validation, health checks, and audit reporting.
    - Integrated static image preview rendering using the core loader.
    - Optimized layout styles for many-select components.

### 2. ScrollLock Microphone Toggle
- **Branch**: `feat/scrolllock-mic-toggle` (PR #1298)
- **Description**: Dedicated service for physical hardware toggle of recording.
- **Key Changes**:
    - Isolated the ScrollLock monitor into a standalone service.
    - Integrated hardware LED status with internal application mic state.
    - Added UI indicators to reflect real-time microphone status.

### 3. VAD & Speech Pipeline Stability
- **Branch**: `feat/speech-stability` (PR #1299)
- **Description**: Reliability and quality improvements for the audio input pipeline.
- **Key Changes**:
    - Fixed audio stacking, crackling, and resource leaks in VAD.
    - Enhanced PCM settings and audio buffer management.
    - Improved SSML support for Google and Volcengine providers.
    - Added rigorous logging and error handling for transcription sessions.

### 4. Artistry, Emotions & Live2D Customizations
- **Branch**: `feat/artistry` & `feat/live2d-customizations-panel`
- **Description**: Expanded expressive capabilities for models.
- **Key Changes**:
    - Restored missing Artistry configuration and capabilities.
    - Integrated ACT emotion pipeline for automated Live2D expression changes.
    - Added dynamic customization panel with CDI/expression parsing.
    - Implemented Layer 1 persistent toggle state for Live2D customizations.

### 5. 3D Stability & Camera Fixes
- **Branch**: Related to `feat/control-islands-camera`
- **Description**: Technical fixes for VRM and 3D rendering issues.
- **Key Changes**:
    - Resolved the "Megazord" bug (all expressions firing at once).
    - Fixed camera slider jitter with programmatic update locks.
    - Stabilized 3D scene and expression synchronization timing.

### 6. Tray & Startup Performance
- **Branch**: `feat/tray-position-startup-fix`
- **Description**: Improvements to application boot-up and window management.
- **Key Changes**:
    - Robust startup window restoration with explicit bounds.
    - Auto-restores window position from snapshots on startup.
    - Added safety delays for reliable Tray API initialization.

### 7. Transcription Feedback Toast
- **Status**: Merged to main in `airi-rebase-scratch`.
- **Description**: Real-time visual feedback for voice commands.
- **Key Changes**:
    - Centralized toast notification: `🎤 You said: <text>`.
    - Helps user verify STT accuracy immediately before LLM processing.
    - Implemented in `hearing.ts` for universal support (Web/Electron/Mobile).

## Environment Details
- **GitHub CLI**: `C:\Program Files\GitHub CLI\gh.exe`

## Pending Tasks

- [ ] **Re-submit PR #1272**: Resolve UTF-16 vs UTF-8 encoding issues for clean resubmission.
- [ ] **Sync Rollup**: Final commit/push of `airi-rebase-scratch` to ensure all latest tweaks are backed up.

## Notes
- Always ensure files are UTF-8 encoded before PR submission.
- Use `gh` CLI for PR management.
