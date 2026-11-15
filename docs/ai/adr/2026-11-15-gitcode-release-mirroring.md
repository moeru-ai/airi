# Complete GitCode Release Mirroring

## Status

Proposed. The workflows take effect after this change reaches the GitHub default branch.

## Context

The mirror uploaded release installers but did not synchronize source, canonical tags, or the Chinese homepage.
Formal promotions skipped the desktop mirror job. Existing GitCode releases retained their original prerelease status.

## Decision

Keep `.github/scripts/publish-gitcode-release.sh` as the entry point for desktop, Android, iOS, and manual synchronization.

1. Fetch GitHub main and the requested tag into a disposable GitCode clone.
2. Push the canonical tag object before creating the GitCode release. Repair an incorrect tag with an exact lease.
3. Create the release or PATCH its current name, notes, and formal status.
4. Keep the existing missing-asset upload and digest checks.
5. Merge upstream main without force-pushing the GitCode default branch.
6. Generate the root homepage from the merged Chinese README. Keep GitHub documentation unchanged.

The homepage links to the current GitHub stable release, not the prerelease that triggered a mobile build.
Only that stable release receives `latest` status. Older formal releases receive `none`, and prereleases receive `pre`.
Before publishing those links, compare the stable mirror asset names, sizes, and platform digests.
Preserve centered banners, relocated documentation assets, and compact download-button widths. Omit the optional Repobeats image.
Use the release page when a platform installer is absent from the upstream release.

Jobs for the same tag share a concurrency group. They do not cancel an active mirror.
Different tags can run together. Default-branch pushes retry after a concurrent update and preserve the competing commit.
Unexpected conflicts outside the generated homepage stop synchronization.

Android mirroring runs after the build job. It also runs when the GitHub upload succeeded but itch.io failed.
Mirror failures remain non-blocking for existing build and distribution jobs. The manual synchronization workflow reports failure normally.

## Credentials

Reuse `GITCODE_TOKEN`, `GITCODE_OWNER`, and `GITCODE_REPO`. The token must permit API access and repository pushes.
Resolve the token owner through the authenticated user API. Supply Git credentials through a host-restricted temporary askpass script.
Do not put a token in a Git URL, process arguments, or commits. Remove credential files when the process exits.
Node 24 runs the homepage generator without installing workspace dependencies.

## Operation

After merging, open GitHub Actions and select **Sync GitCode** to backfill a published release by tag.
This workflow does not build installers. It runs on GitHub runners rather than the operator's computer.
Future published releases and formal promotions use the same synchronization entry point automatically.

`GITCODE_REPOSITORY_URL` and `GITHUB_REPOSITORY_URL` override Git remotes for local integration tests.
Production workflows use the public hosting URLs. Tests use temporary local repositories and fake HTTP tools.

## Verification

Run `pnpm test:root` for release promotion, homepage rendering, workflow guards, and local Git integration tests.
The Git tests cover annotated tag repair, preserved mirror history, repeat runs, incomplete assets, and concurrent default-branch updates.
Run Bash syntax checks and `pnpm lint` before publication.

API contract: [Update Repository Release](https://docs.gitcode.com/en/docs/apis/patch-api-v-5-repos-owner-repo-releases-tag/).
Git safety contract: [git push](https://git-scm.com/docs/git-push).
