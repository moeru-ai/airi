---
name: create-pr
description: Prepare and create a GitHub pull request for AIRI changes, including required before/after visual evidence for user-visible UI changes. Use whenever Codex is asked to open, create, publish, or prepare a PR from the current branch.
---

# Create Pull Request

Create a reviewable PR from the exact commits intended for publication.

## Workflow

1. Inspect repository instructions, status, branch, remotes, and the merge base with the target branch.
2. Review the complete diff and run checks proportionate to the changed surfaces. Always satisfy the repository's required final checks.
3. When the diff changes user-visible UI, follow the visual-evidence workflow below. Do not substitute test output or an assertion that the UI is unchanged for screenshots.
4. Publish the intended commits through the available GitHub/`gh` workflow.
5. Compose the PR body with a concise summary, exact verification commands, and the required visual table.
6. Create the PR, then open it and verify its title, base/head branches, body, and embedded images.
7. Get the PR review threads, comments, and check status. If a comment identifies a confirmed error, fix it, run focused checks, push the update, reply with evidence, and resolve the thread.

## Visual Evidence Workflow

1. Trace the diff to every affected page, window, dialog, route, responsive state, theme, and locale. Shared primitives and global styles may require several consumers, not one representative page.
2. Record a stable ID and human-readable title for each state. Prefer existing product-owned Vishot scenarios, Histoire stories, routes, and nearby tests.
3. Resolve the target branch and compute `git merge-base HEAD <target>`. Create a detached temporary worktree for the merge-base; never switch or overwrite the contributor's active worktree.
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

   Use `before: absent` for a new state and `after: removed` for a deleted state. A capture failure is blocking; record its reason instead of silently omitting the state.
9. Upload every local image as a GitHub user asset by invoking `$upload-github-attachment` while composing the PR.
10. Put all pairs under `## Visual changes`, with an image row followed by its component or page name row:

   ```markdown
   | Before | After |
   |---|---|
   | ![](before-user-asset-url) | ![](after-user-asset-url) |
   | Settings / Connection | Settings / Connection |
   ```

11. Verify that every user-asset URL matches the PR intent. Remove temporary worktrees only after upload succeeds; clear ignored `.vishot` captures when they are no longer useful locally.

## Visual Evidence Contract

Treat Vishot output as ephemeral handoff data. GitHub owns the uploaded copy; the repository must remain free of tracked PR-only images.

If GitHub asset upload is unavailable in the current environment, stop before creating an incomplete UI PR and report the local image paths needed to finish it.
