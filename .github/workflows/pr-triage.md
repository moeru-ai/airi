---
on:
  workflow_dispatch:
    inputs:
      pull_request_number:
        description: "Pull request number to triage manually"
        required: true
        type: string
  roles: all

permissions:
  contents: read
  issues: read
  pull-requests: read

checkout: false

engine: copilot

tools:
  github:
    toolsets: [repos, issues, pull_requests, labels]
    min-integrity: none

network: defaults

safe-outputs:
  report-failure-as-issue: false
  add-labels:
    max: 12
    target: ${{ github.event.pull_request.number || github.event.inputs.pull_request_number }}
    allowed:
      - bug
      - feature
      - pending triage
      - apps/stage-pocket
      - apps/stage-tamagotchi
      - apps/stage-web
      - env/os-all
      - env/os-linux
      - env/os-macos
      - env/os-windows
      - priority/general
      - priority/nice-to-have
      - priority/urgent
      - scope/agent
      - scope/audio-input
      - scope/audio-output
      - scope/avatar
      - scope/avatar/live2d
      - scope/avatar/vrm
      - scope/documentation
      - scope/engineering
      - scope/extension
      - scope/game-playing-ai
      - scope/i18n
      - scope/providers
      - scope/server-api
      - scope/ui
  remove-labels:
    max: 24
    target: ${{ github.event.pull_request.number || github.event.inputs.pull_request_number }}
    allowed:
      - bug
      - feature
      - pending triage
      - apps/stage-pocket
      - apps/stage-tamagotchi
      - apps/stage-web
      - env/os-all
      - env/os-linux
      - env/os-macos
      - env/os-windows
      - priority/general
      - priority/nice-to-have
      - priority/urgent
      - scope/agent
      - scope/audio-input
      - scope/audio-output
      - scope/avatar
      - scope/avatar/live2d
      - scope/avatar/vrm
      - scope/documentation
      - scope/engineering
      - scope/extension
      - scope/game-playing-ai
      - scope/i18n
      - scope/providers
      - scope/server-api
      - scope/ui
---

# PR Triage

Classify the target pull request with content labels.

## Goal

Read the target pull request and keep only the relevant automatically-managed triage labels in sync.

The target pull request is:

- PR `#${{ github.event.inputs.pull_request_number }}` for `workflow_dispatch`

Managed labels:

- Type: `bug`, `feature`
- App surface: `apps/stage-pocket`, `apps/stage-tamagotchi`, `apps/stage-web`
- Environment: `env/os-all`, `env/os-linux`, `env/os-macos`, `env/os-windows`
- Scope: `scope/agent`, `scope/audio-input`, `scope/audio-output`, `scope/avatar`, `scope/avatar/live2d`, `scope/avatar/vrm`, `scope/documentation`, `scope/engineering`, `scope/extension`, `scope/game-playing-ai`, `scope/i18n`, `scope/providers`, `scope/server-api`, `scope/ui`
- Priority: `priority/general`, `priority/nice-to-have`, `priority/urgent`
- Fallback: `pending triage`

Never add or remove any label outside that managed set.

## Required inputs

Inspect, in order:

1. PR title
2. PR body
3. Linked issues explicitly referenced in the PR title or body
4. Changed files
5. Existing labels on the PR

Do not use web search. Do not use bash or edit tools. Do not post comments. Do not update the PR body or title. Do not request reviewers.

## Classification rules

### Confidence and fallback

- Only apply a managed label when the evidence is explicit from the PR text, linked issues, or changed file paths.
- If the PR is too vague, too short, intentionally a test, or the classification is meaningfully ambiguous, remove all currently-present managed labels and leave only `pending triage`.
- If you can classify it confidently, remove `pending triage`.

### Type labels

- Do not apply both `bug` and `feature`.
- For documentation-first PRs, do not apply `feature`.

### Documentation

- Apply `scope/documentation` when the PR is primarily documentation, manuals, tutorials, guides, README work, or mostly touches `docs/` and similar documentation files.
- Documentation PRs may still receive environment labels if the docs are explicitly platform-specific, but they should not receive `feature`.

### App labels

- Apply `apps/stage-web` when files under `apps/stage-web/` change, or the PR text explicitly says the change is for the web app or PWA/browser surface.
- Apply `apps/stage-tamagotchi` when files under `apps/stage-tamagotchi/` change, or the PR text explicitly says desktop/Electron/Windows/macOS/Linux app.
- Apply `apps/stage-pocket` when files under `apps/stage-pocket/` change, or the PR text explicitly says mobile/iOS/Android app.
- Multiple app labels are allowed when the evidence is explicit.

### Environment labels

- Apply `env/os-windows`, `env/os-macos`, or `env/os-linux` only when the PR text or linked issues explicitly call out that platform.
- Apply `env/os-all` only when the PR explicitly describes all major desktop platforms or a clearly cross-platform OS fix.
- Do not infer OS labels from maintainers' guesses alone.
- `env/os-all` should replace per-OS labels when the evidence is clearly all-platform.

### Scope labels

- Apply `scope/ui` for UI, UX, settings, layouts, views, components, visual behavior, or interaction flows.
- Apply `scope/providers` for provider integrations, provider configuration, model/provider selection, or supported provider behavior.
- Apply `scope/audio-input` for ASR, STT, microphone capture, VAD, hearing, transcription input pipelines.
- Apply `scope/audio-output` for TTS, voice output, speech synthesis, voice playback, or voice cloning.
- Apply `scope/avatar` for general avatar rendering/control/interaction.
- Apply `scope/avatar/live2d` when the work is specifically about Live2D.
- Apply `scope/avatar/vrm` when the work is specifically about VRM.
- Apply `scope/engineering` for CI, build, release, packaging, toolchain, workflow, infrastructure, repository automation.
- Apply `scope/extension` for extensions, plugins, mod APIs, tentacle APIs, or channel integrations.
- Apply `scope/agent` for agent workflow, orchestration, LLM runtime, prompt routing, agent behavior.
- Apply `scope/server-api` for the maintained server API or public server service behavior.
- Apply `scope/i18n` for translation keys, locale additions, localization-only or localization-heavy work.
- Apply `scope/game-playing-ai` when the change is specifically about game-playing agent behavior.
- Multiple scope labels are allowed when the evidence is explicit and non-conflicting.
- If a PR is clearly documentation-first, use `scope/documentation` instead of trying to classify it as another primary scope unless the non-documentation scope is also explicit and substantial.

### Priority labels

- Apply at most one priority label.
- Apply `priority/urgent` only when the PR or linked issue clearly says urgent, critical, blocker, severe regression, production breakage, or similarly high urgency.
- Apply `priority/general` when the PR or linked issue clearly says it should be in the current release or treated as normal release work.
- Apply `priority/nice-to-have` when the PR or linked issue clearly frames it as polish, optional, low urgency, or explicitly nice-to-have.
- If urgency is not explicit, do not apply any priority label.

## Label synchronization behavior

When you finish classification:

1. Compute the desired managed labels for this PR.
2. Compare them against the PR's existing managed labels only.
3. Remove managed labels that are no longer desired.
4. Add desired managed labels that are missing.

Important constraints:

- Never remove unmanaged labels.
- Never add more labels than the evidence supports.
- If confident classification is possible, do not leave `pending triage`.
- If confident classification is not possible, the only managed label that should remain is `pending triage`.
