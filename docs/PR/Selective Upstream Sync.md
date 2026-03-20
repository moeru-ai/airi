# Selective Upstream Sync

## Purpose

This document defines the process for pulling useful upstream improvements from `moeru-ai/airi` into `dasilva333/airi` without blindly rebasing or merging large batches of commits.

The goal is to preserve the fork as the tested source of truth while still benefiting from upstream fixes and improvements where they are actually valuable.

## Why This Process Exists

The fork is often:

- many commits ahead of upstream
- a smaller number of commits behind upstream
- carrying heavily tested local changes that should not be casually overwritten

A blind rebase or merge is the wrong default when:

- upstream includes large amounts of unrelated churn
- upstream touches files that are actively customized in the fork
- Git conflict resolution would be tempted to pick a side instead of preserving both intents

This process treats upstream as a content source, not a history source.

## Core Principle

The fork's current tested behavior is the baseline.

Upstream changes are reviewed as candidate improvements. They are not accepted automatically just because they are newer.

In practical terms:

- prefer the fork's behavior when there is conflict
- only absorb upstream intent where it is clearly useful
- preserve both intents when both are valid
- ignore upstream noise that does not improve the fork

## Correct Terminology

This workflow is better described as:

- selective upstream sync
- file-level upstream integration
- curated upstream assimilation
- forward-port audit

It is **not** primarily a rebase workflow, even if Git tools are used underneath.

## Default Working Model

Use `airi-clean-pr` as the clean-room scratch repo.

Use `airi-rebase-scratch` as the live, tested repo and do not use it as a conflict playground.

`airi-rebase-scratch` must remain checked out on local branch `main`.

Do not switch `airi-rebase-scratch` to temporary branches.

Do not use `airi-rebase-scratch` for rebases, cherry-pick experiments, conflict resolution, or branch-staging work.

The only acceptable advancement model for `airi-rebase-scratch` is:

- keep the repo checked out on `main`
- validate risky work somewhere else
- then bring approved work into `main`
- fast-forward-like advancement of the live line only

If a temporary branch is needed at all, it belongs in `airi-clean-pr` or a disposable worktree, never in `airi-rebase-scratch`.

The clean-room process should be:

1. Fetch the latest `origin/main` and `upstream/main`.
2. Treat the fork's `origin/main` as the base.
3. Compute the upstream-only file set from `origin/main...upstream/main`.
4. Filter out obvious noise and unrelated surfaces.
5. Review the remaining files one by one.
6. Classify each file as `ignore`, `inspect`, `import`, or `hand-merge`.
7. Integrate only the approved file set in the clean room.
8. Typecheck and smoke-test there.
9. Port the approved result back to the live repo only after validation.

## File Classifications

### `ignore`

Use when upstream changed a file but the change is irrelevant to the fork's current goals.

Examples:

- docs churn
- mobile-only assets
- Android scaffolding
- project-level agent skill updates
- telemetry changes the fork does not currently want

### `inspect`

Use when a file may contain worthwhile ideas, but it is not yet clear whether the full upstream change belongs in the fork.

This is the staging state for files that need human judgment before acceptance.

### `import`

Use when the upstream file change is low-risk and the fork rarely or never customizes that file.

This means the file can usually be copied over with little or no local adaptation.

### `hand-merge`

Use when the file is important, actively customized in the fork, or likely to carry conflicting intent.

This means:

- review the upstream diff manually
- preserve the fork's existing behavior first
- selectively pull over useful upstream pieces
- never rely on one-click conflict resolution

## Decision Heuristics

Choose `hand-merge` when any of these are true:

- the file is routinely edited in the fork
- the file controls behavior already stabilized locally
- the file is a store, runtime entrypoint, provider layer, or renderer surface
- losing local intent would be costly

Choose `import` when:

- the file is mostly declarative
- the fork rarely touches it
- the upstream change is clearly beneficial and contained

Choose `ignore` when:

- the file does not affect the fork's active surfaces
- the change is mostly release/process churn
- there is no meaningful user value for the fork

## Practical Goal

This process is designed to answer:

> Which upstream changes are actually worth taking, and how do we preserve fork quality while taking them?

That is the standard moving forward.

## Tracking Baselines

Because this workflow is content-based instead of history-based, the GitHub ahead/behind counters will often remain misleading.

A non-zero `behind` count does **not** automatically mean the fork is functionally missing all of those upstream changes.

For this reason, every selective sync pass should record:

- the upstream head SHA that was reviewed
- the fork commit where the accepted changes landed
- the approved file set
- any explicitly rejected upstream files or concepts

This becomes the real baseline for future sync work.

## Workspace Invariant

Treat this as a hard rule:

- `airi-rebase-scratch` is the canonical live workspace
- `airi-rebase-scratch` should always be checked out on `main`
- `airi-clean-pr` is the playground
- disposable worktrees are the playground

If there is any doubt about where risky Git operations belong, the answer is never `airi-rebase-scratch`

### Current Recorded Baseline

- reviewed upstream head: `4671ceaaae92f5d780319394512bf63ed01a85f1`
- clean-room branch: `selective-upstream-sync-2026-03-16`
- accepted selective-sync landing commit: `a13e3479`
- Codex thread id: `019ceec8-bb6c-7f01-a7b6-f505fe20e6b4`

Interpretation:

- GitHub may still report the fork as being behind upstream
- that number is historical, not a full measure of functional drift
- future selective sync passes should compare against the last reviewed upstream head first, not just the raw behind count
