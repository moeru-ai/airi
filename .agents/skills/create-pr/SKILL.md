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

## Behavior Evidence Workflow

Apply this workflow when the diff changes runtime behavior. A small wording, styling, or local cleanup change does not need a behavior diagram.

1. List the changed behavior scenarios with a stable ID and short title. Include affected state transitions, async ordering, retries, cancellation, event routing, persistence, cleanup, and failure or recovery paths.
2. For each scenario, select the smallest evidence form that makes the change reviewable: prose for a local path, a module flow for changed ownership or dependencies, a sequence diagram for ordering, or a state diagram for changed transitions or terminal states.
3. For a fix that changes a flow or state model, provide comparable `Before` and `After` diagrams. For a feature, show the resulting flow or state model and explain any replaced behavior.
4. Cover every listed scenario in the PR body or name it as unverified. Do not silently omit a changed path because a diagram seems optional.
5. Inspect the evidence against the diff. Keep node names and abstraction level consistent across a `Before` and `After` pair.

When a scenario changes state, show the states, triggering events or commands, and terminal or recovery states that the diff affects. When it changes ordering, show the participants and the order of calls, events, retries, or cleanup. Name correlation and idempotency keys when they isolate concurrent work.

Keep diagrams tied to code. Label arrows with calls, events, commands, or data. Identify domain-rule and mutable-state owners. Show external systems, IPC, queues, databases, caches, and configuration when they affect the behavior. Match each `alt` branch to a code branch. Mark inferred paths as assumptions or open questions.

## Boundary and Verification Mapping

Select risks that match the diff. Start with inputs and side effects. Then examine failure, retry, duplicate delivery, concurrency, ordering, authorization, cleanup, migration, and rollback. Reuse the behavior scenario IDs when they connect an invariant to its evidence.

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
