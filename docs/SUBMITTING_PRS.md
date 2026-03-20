# Submitting Pull Requests (AIRI)

This guide outlines the standardized process for creating feature branches and submitting Pull Requests (PRs) to the `moeru-ai/airi` repository using the GitHub CLI (`gh`).

## Tool Configuration

The GitHub CLI is required for this process. On this system, it is located at:
`C:\Program Files\GitHub CLI\gh.exe`

To use it in PowerShell, you may need to use the full path or ensure it is in your `PATH`.

## The PR Workflow

### 1. Prepare Workspace
Before starting, ensure your `main` branch is up to date with the upstream repository.

```powershell
# Navigate to your clean-pr workspace
cd c:\Users\h4rdc\Documents\Github\airi-clean-pr

# Update main
git checkout main
git pull upstream main
```

### 2. Create Feature Branch
Always create a descriptive feature branch from a clean `main` state.

```powershell
git checkout -b feat/your-feature-name
```

### 3. Apply Changes
Port your changes from the scratch workspace or implement them directly. After verifying:

```powershell
git add .
git commit -m "feat: descriptive commit message"
```

### 4. Push to Fork
Push your branch to your personal fork (`origin`).

```powershell
git push origin feat/your-feature-name
```

### 5. Create Pull Request
Use the `gh` CLI to create the PR. This ensures consistency and allows for detailed descriptions.

```powershell
# Use the full path for reliability
& "C:\Program Files\GitHub CLI\gh.exe" pr create `
  --title "feat: descriptive title" `
  --body "## Description`nDetailed explanation of changes..." `
  --head feat/your-feature-name `
  --base main
```

## Creating the STT Feedback PR

Example command for the current STT / Log Cleanup task:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" pr create `
  --title "feat: implement stt feedback toasts and refined llm logging" `
  --body "## Description`nThis PR introduces visual feedback for the Speech-To-Text (STT) pipeline and refines terminal logging..." `
  --head feat/stt-feedback-log-cleanup `
  --base main
```
