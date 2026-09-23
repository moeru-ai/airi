---
name: create-pr
description: Prepare and create an AIRI pull request with verifiable change context, architecture evidence, and required visual evidence. Use when Codex must open, create, publish, or prepare a PR from the current branch.
---

# Create Pull Request

Create a reviewable PR from the exact commits intended for publication. The PR body must explain the changed system, not only list changed files.

## Workflow

1. Inspect the repository instructions, status, branch, remotes, and target branch.
2. Compute the merge base. Record the exact `base...head` comparison that the PR will publish.
3. Detect stacked work. Separate inherited changes from this PR's own changes.
4. Review the complete diff. Trace changed files to their entry points, callers, state owners, persistence, and external boundaries.
5. Classify the PR as a feature, fix, refactor, maintenance change, or a combination. Select context evidence that helps reviewers understand this change.
6. Run checks that match the changed surfaces. Satisfy the repository's required final checks.
7. If the diff changes user-visible UI, follow the visual-evidence workflow below.
8. Read [the PR body template](references/pr-body.md). Compose the body from verified code and runtime evidence.
9. Publish the intended commits through the available GitHub or `gh` workflow.
10. Create the PR. Then open it and verify the title, base, head, body, diagrams, tables, and image Markdown.
11. Get the PR review threads, comments, and check status. Fix each confirmed error and run focused checks.
12. Push each correction. Reply with evidence and resolve the applicable thread.

## Context Evidence

Build a small context brief before you write the PR body. Keep the analysis read-only until the normal publication step.

- Record the repository, target branch, head branch, merge base, and inspected commit range.
- For a stacked PR, identify the parent PR or branch. Do not describe inherited changes as this PR's own changes.
- Separate runtime code from generated files, lockfiles, snapshots, and migrations.
- Trace the changed files to real module boundaries. Include entry points, composition roots, protocols, domain services, persistence, adapters, and callers when applicable.
- Support architecture claims with file paths or symbols. Mark an unproven business intent as an assumption or an open question.
- Do not expose tokens, secrets, full user records, or webhook payloads.

## PR Body Contract

Use the structure in [the PR body template](references/pr-body.md) as a decision guide. Match the detail to the scope, risk, and review cost.

- Every PR needs a concise `## Summary` and `## Verification` section.
- Add `## Change map` when the diff changes several modules, responsibilities, or ownership boundaries.
- Add `## Architecture and behavior` when a diagram explains the change faster or more accurately than prose.
- Add `## Boundaries and risks` when the change has meaningful failure modes, invariants, migrations, or external effects.
- Keep a small and local PR body small. Do not add a table or diagram only to satisfy a template.

When a change map is useful, prefer this table:

| Module | Before | After | Description |
| --- | --- | --- | --- |
| `<module or boundary>` | `<previous responsibility or behavior>` | `<new responsibility or behavior>` | `<reason and effect>` |

Use module or domain names in the first column. Do not use a raw file list as the module map. Prose is sufficient for a single local module.

### Feature PRs

A feature PR body must explain the new capability and its verified behavior. Add the following context when it helps reviewers:

- The user or system capability that the feature adds.
- The new modules and the changed responsibilities of existing modules.
- The new call, event, data, or state flow.
- The feature boundaries, disabled or failure behavior, and rollout constraints.
- The tests and runtime evidence that demonstrate the new behavior.

Use a compact Mermaid module diagram when the feature crosses module boundaries. Use a sequence diagram when timing or ordering is central. Use a state or data-ownership diagram when persisted state is central.

### Fix PRs

A fix PR body must explain the observed failure, root cause, correction, and regression protection. Concise prose is sufficient when the fault and correction stay local.

Use a relevant Before/After diagram pair when the root cause or correction depends on structure, ordering, lifecycle, or state:

- Use module diagrams when ownership, dependencies, or call edges changed.
- Use sequence diagrams when order, retry, cancellation, cleanup, or event routing changed.
- Use state diagrams when transitions, terminal states, persistence, or recovery changed.

Keep the same node names, participants, direction, and abstraction level in both diagrams. This makes the changed edges and steps easy to compare. Label the diagrams `Before` and `After`.

If a fix changes more than one of these views, include each pair that materially helps the review. Do not force a diagram for a local or self-explanatory fix. Explain an omitted diagram only when reviewers can reasonably expect one.

### Refactor and Maintenance PRs

Describe the preserved behavior and the moved responsibility. Include diagrams only when a boundary, dependency, lifecycle, or ownership model changed.

## Diagram Rules

- Draw only the nodes that explain the change.
- Label arrows with calls, events, commands, or data.
- Identify the owner of domain rules and mutable state.
- Show external systems, IPC, queues, databases, caches, and configuration when they affect the change.
- Make each `alt` branch match a code branch or mark it as an open question.
- Name correlation keys, idempotency keys, request IDs, or session IDs when they isolate concurrent work.
- Do not present an inferred path as verified behavior.

## Boundary and Verification Mapping

Select risks that match the diff. Start with inputs and side effects. Then examine failure, retry, duplicate delivery, concurrency, ordering, authorization, cleanup, migration, and rollback.

Map each high-risk invariant to existing tests, new tests, CI checks, or an unverified runtime condition. A green CI result proves only that its configured checks passed.

Use a table when the PR has several meaningful edge cases or invariants:

| Invariant or boundary | Failure mode | Protection | Evidence or gap |
| --- | --- | --- | --- |
| `<required behavior>` | `<how it can fail>` | `<code or design guard>` | `<test, runtime evidence, or unverified gap>` |

Distinguish verified facts, assumptions, and unverified conditions. Do not write "safe," "fixed," or "backward compatible" without evidence.

## Visual Evidence Workflow

1. Trace the diff to every affected page, window, dialog, route, responsive state, theme, and locale. Shared primitives and global styles can require several consumers, not one representative page.
2. Record a stable ID and human-readable title for each state. Prefer existing product-owned Vishot scenarios, Histoire stories, routes, and nearby tests.
3. Use the recorded merge base. Create a detached temporary worktree for that commit. Never switch or overwrite the contributor's active worktree.
4. Use `$use-vishot` to capture the same scenario from the merge base and proposed HEAD. It delegates by runtime:
   - `$use-vishot-with-electron` for Electron windows.
   - `$use-vishot-with-web` for browser routes.
   - `$use-vishot-with-capacitor` for Stage Pocket or another Capacitor app.
5. Use identical scenario definitions, viewports, locale, theme, fixture data, and readiness conditions for both revisions.
6. Construct explicit Vishot output directories using the repository-owned `.vishot/[branch/][group/]` convention. Omit the branch segment for the default branch and use a filesystem-safe segment for other branches. Keep capture group and name identical across revisions.
7. Inspect every image. Reject blank, loading, error, permission, onboarding, or unstable captures unless that is the documented state.
8. Pair results by stable ID and retain this handoff record:

   ```text
   id: settings-connection
   title: Settings / Connection
   runtime: web
   viewport: 1440x900
   before: /absolute/repo/.vishot/settings/settings-connection.png
   after: /absolute/repo/.vishot/feat-settings/settings/settings-connection.png
   ```

   Use `before: absent` for a new state and `after: removed` for a deleted state. A capture failure is blocking. Record its reason instead of silently omitting the state.
9. Upload every local image as a GitHub user asset by invoking `$upload-github-attachment` while composing the PR.
10. Put all pairs under `## Visual changes`. Put an image row before its component or page name row:

   ```markdown
   | Before | After |
   |---|---|
   | ![](before-user-asset-url) | ![](after-user-asset-url) |
   | Settings / Connection | Settings / Connection |
   ```

11. Verify that every user-asset URL matches the intended capture. Follow `$upload-github-attachment` for upload success criteria. Do not add GET/HEAD probes or block on anonymous 404 responses. Remove temporary worktrees only after upload succeeds. Clear ignored `.vishot` captures when they are no longer useful locally.

## Visual Evidence Contract

Treat Vishot output as ephemeral handoff data. GitHub owns the uploaded copy. The repository must remain free of tracked PR-only images.

If GitHub asset upload is unavailable, stop before you create an incomplete UI PR. Report the local image paths that the PR needs.
