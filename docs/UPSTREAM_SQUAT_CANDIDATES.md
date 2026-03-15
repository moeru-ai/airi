# Upstream Squat Candidates

This note tracks open upstream PRs that look worth integrating into `dasilva333/airi`, plus the current decision on each one.

## Current Priorities

- **PR #1065**: `fix(onboarding): allow manual model entry when list is empty`
  - **Why it matters**: Good baseline fix for onboarding. More importantly, onboarding should stop acting like a weird shortlist-driven flow and expose the real provider surface instead of implying that unsupported providers do not exist.
  - **Fork direction**: Use this as the starting point for a broader onboarding refresh:
    - keep manual entry fallback
    - remove the misleading truncated provider experience
    - surface the full supported provider set cleanly
  - **Priority**: Highest

- **PR #1237**: `feat(stage-ui): add chat settings with stream idle timeout`
  - **Why it matters**: Looks benign and potentially useful for chat robustness.
  - **Risk**: Chat has already been heavily modified in the fork, especially around persistence, stream handling, and session stability. This must be merged carefully and reviewed against the recent local chat fixes.
  - **Priority**: High

- **PR #851**: `feat(stage-tamagotchi): add option for chat area send key`
  - **Why it matters**: Straightforward Tamagotchi UX improvement.
  - **Fork direction**: Good bundle candidate alongside `#1237` because both touch chat UX rather than deep provider/runtime internals.
  - **Priority**: High

- **PR #1190**: `fix(stage-pages): add missing local provider settings routes`
  - **Why it matters**: Practical settings/page routing paper-cut fix.
  - **Fork direction**: Low-risk squat candidate. Worth checking for overlap with existing fork changes, but likely easy to absorb.
  - **Priority**: Medium

## Maybe, But Not Yet

- **PR #1148**: `feat(ui,stage-ui,stage-pages,i18n): transcription confidence filter`
  - **Current read**: Lower priority because the fork already has a useful STT toast that shows what the server heard.
  - **Best argument in favor**: A confidence filter is not the same as a toast. A toast is post-hoc visibility; a confidence filter can actively suppress or flag low-confidence transcript segments before they become chat input.
  - **Decision**: Do not prioritize right now.

## Explicitly Deferred / Avoid

- **PR #1033**: `feat(stage-ui-live2d): exp3 expression system + auto-blink rework`
  - Too large and too far from the current fork state. Integration cost is high.

- **PR #1222**: `fix(llm): flatten content array for OpenAI-compatible providers`
  - Looks risky relative to the current fork because nothing is obviously broken there right now. Avoid speculative provider churn unless a real bug appears.

- **Provider churn in general**
  - Examples: `#1378`, `#1314`, `#1221`
  - These are not priority squat targets unless they unblock a real user need in the fork.

## Operational Notes

- Use `airi-clean-pr` and isolated worktrees for all upstream squat work.
- Do not use `airi-rebase-scratch` as the PR rebasing / merge-conflict sandbox.
- When pulling upstream PRs that touch chat, stage, model selection, or Discord, compare them against fork-local fixes first. Those surfaces have diverged significantly.
