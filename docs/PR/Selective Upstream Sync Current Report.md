# Selective Upstream Sync Current Report

## Comparison Basis

This report compares:

- fork base: `dasilva333/airi:main`
- upstream source: `moeru-ai/airi:main`

Current comparison at time of writing:

- fork head: `f31849524a8e4f811e09abd3634ab597b52783d9`
- upstream head: `65faf3fe1826804c41f46c66049ecac76d5cb303`
- fork is `116` commits ahead
- fork is `16` commits behind

Selective-sync result:

- clean-room branch: `selective-upstream-sync-2026-03-16`
- accepted changes landed later on fork commit: `4359a6ec`
- this means the GitHub `behind` count may remain non-zero even after the approved upstream improvements were integrated

## High-Level Read

The missing upstream range contains a large amount of noise:

- `.agents/skills/**`
- `apps/stage-pocket/android/**`
- docs/release churn
- PostHog and packaging churn

So this is not a candidate for a blind merge or rebase.

The correct strategy is selective file-level intake.

## Workspace Rule

For this selective-sync process:

- `airi-rebase-scratch` is not a branch playground
- `airi-rebase-scratch` must stay on `main`
- `airi-clean-pr` or disposable worktrees hold temporary sync branches
- approved changes are only brought back after validation

## Target File Set

These are the files currently worth considering from the upstream-only range.

### `hand-merge`

These files are either actively customized in the fork or sit on critical behavior surfaces.

- [providers.ts](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/providers.ts)
- [types.ts](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/libs/providers/types.ts)
- [run.ts](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/libs/providers/validators/run.ts)
- [Model.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui-live2d/src/components/scenes/live2d/Model.vue)

Reasoning:

- `providers.ts` is one of the fork's most customized surfaces and cannot be trusted to an automatic merge.
- `types.ts` is tightly coupled to `providers.ts`, so it should be reviewed alongside it.
- `run.ts` affects provider validation/runtime behavior, which has user-facing consequences.
- `Model.vue` sits on a sensitive Live2D rendering path and upstream includes a revert in this area.

### `inspect`

These files are likely low-frequency local touch points, but they still affect user-facing provider behavior and should be reviewed before importing.

- [use-provider-validation.ts](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/composables/use-provider-validation.ts)
- [provider-validation-alerts.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/providers/provider-validation-alerts.vue)
- [[providerId].vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/chat/[providerId].vue)
- [azure-ai-foundry.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/chat/azure-ai-foundry.vue)
- [cloudflare-workers-ai.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/chat/cloudflare-workers-ai.vue)
- [lm-studio.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/chat/lm-studio.vue)
- [ollama.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/chat/ollama.vue)
- [screen.vue](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/ui/src/components/layouts/screen.vue)

Reasoning:

- These files likely contain useful upstream improvements.
- They are not the fork's primary customization surfaces.
- They still warrant inspection because they affect provider settings UX and shared layout behavior.

### `import`

These files are probably safe to take with minimal risk.

- [settings.yaml](/C:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/i18n/src/locales/en/settings.yaml)

Reasoning:

- This is a non-functional translation surface.
- Local customization risk is low.
- It can be imported after a quick eyeball for label collisions.

### `ignore`

The rest of the upstream-only file set should be ignored for this sync pass unless a later review gives them a specific reason to matter.

That includes:

- `.agents/skills/**`
- `apps/stage-pocket/**`
- project/package churn
- docs and release notes
- unrelated translations
- telemetry and build-system changes that do not serve the fork right now

## Recommended Review Order

1. `providers.ts`
2. `types.ts`
3. `run.ts`
4. `Model.vue`
5. provider settings pages and validation UI
6. `screen.vue`
7. `settings.yaml`

## Working Assumption

The fork should continue to prioritize:

- tested local behavior
- stable UX already validated by real use
- preserving custom integrations

Upstream changes should only be absorbed where they clearly improve the fork without regressing those priorities.
