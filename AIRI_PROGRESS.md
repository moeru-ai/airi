# AIRI Project State & Progress

## Project Overview
- **Project Name**: AIRI ([moeru-ai/airi](https://github.com/moeru-ai/airi))
- **Primary Workspace**: `airi-rebase-scratch` (c:\Users\h4rdc\Documents\Github\airi-rebase-scratch)
    - This is a fork of the main project with rolled-in changes.
    - Connected to `dasilva333/airi` (main branch).
- **Staging/Clean Room**: `airi-clean-pr`
    - Used for submitting clean PRs by porting changes from the rollup repo.
- **Unused/Reference**: `airi` folder (Do not touch).

## Environment Details
- **GitHub CLI**: `C:\Program Files\GitHub CLI\gh.exe`

## Pending Tasks (Priority Order)

1. **Re-submit PR #1272**
    - **Goal**: Resolve UTF-16 vs UTF-8 encoding issues that caused files to be submitted as binary.
    - **Source**: [PR #1272 Changes](https://github.com/moeru-ai/airi/pull/1272/changes)
    - **Action**: Identify files, ensure UTF-8 (no BOM), and submit via `airi-clean-pr`.

2. **Commit/Push Rollup Changes**
    - **Goal**: Ensure no untracked changes in `airi-rebase-scratch`.
    - **Action**: `git status`, commit, and push to `dasilva333/airi`.

3. **ScrollLock Microphone Toggle**
    - **Goal**: Add feature where the ScrollLock button enables the microphone.
    - **Action**: Create feature branch and submit PR.

4. **Improved VAD Voice Quality**
    - **Goal**: Port improvements to VAD (voice quality/PCM settings).
    - **Action**: Create feature branch and submit PR.

## Notes
- Always ensure files are UTF-8 encoded before PR submission.
- Use `gh` CLI for PR management.
