# Automatic labels

Category triage runs when an issue opens, reopens, changes content, or changes its issue type.
It also runs when a PR opens, reopens, changes content, receives commits, or changes draft status.
The classifier reads the title, body, issue type, and PR file paths.
It manages `bug`, `feature`, and relevant app, environment, and scope labels.
The full allowlist is in `workflows/copilot-labels.yml`.
For ambiguous categories, it omits the label. Retrieval failures leave labels unchanged.
Humans manage priority, question, information requests, feature acceptance, and `pending triage` labels.
The classifier never adds or removes those labels.

The classifier uses Copilot CLI `1.0.91` with the `COPILOT_GITHUB_TOKEN` secret and automatic model selection.
The Copilot process has no tools, built-in MCP servers, or GitHub write token.
A separate GitHub Actions step validates the JSON label array against the category allowlist.
Invalid output stops the run before label changes. Human labels remain outside the allowlist.
To classify an existing item, dispatch `copilot-labels.yml` with its number in `item_number`.
The workflows start after they reach the default branch.

PR review labels identify who must act next:

| State | Label |
| --- | --- |
| Draft PR | No automatic waiting label |
| New open PR ready for review | `pr-review/waiting-maintainer` |
| A maintainer requests changes | `pr-review/waiting-on-author` |
| A new PR commit changes files after the request | `pr-review/waiting-maintainer` |
| The maintainer dismisses or replaces the change request with approval | `pr-review/waiting-maintainer` |
| Closed or merged | No automatic waiting label |

Draft status takes precedence over the review state. Converting a PR to draft removes both automatic waiting labels.
Marking a draft ready reevaluates active change requests and subsequent file changes. Category and human labels remain unchanged.

A maintainer has repository write access, as defined by GitHub's `latestOpinionatedReviews(writersOnly: true)` filter.
Reviews from other users do not change the waiting labels.
The newest active maintainer change request starts the author response cycle.
A later maintainer change request starts another cycle.
Comments do not replace a change request.

A meaningful update is a file-changing PR commit recorded after the latest change request.
The workflow compares the reviewed commit with the current PR head and includes only commits that belong to the PR.
It excludes merge commits, commits inherited from the base branch, empty commits, and commits recorded before the request.
A metadata edit or merge from `main` does not return the PR to the maintainer.
A rebase that records new file-changing commits can return the PR to the maintainer.
Commit dates identify new work. A commit created before a request and pushed afterward does not trigger the handoff.
Maintainers decide whether the update resolves the feedback. The workflow identifies an update for another review.

Review labels update after PR events and review events. An hourly run reconciles all open PRs.
The review event workflow has no permissions. Its completion triggers the label workflow, including for fork PRs.
The label workflow reads current GitHub API data. It never checks out PR code or reads review workflow artifacts.
Fork workflow approval requirements can delay review events. The hourly run also handles these PRs.
Manual hold, deployment, and merge labels remain outside review automation.

The existing Sync Labels workflow creates labels and updates their descriptions and colors from `labels.yml`.
It preserves repository labels absent from the manifest because `prune` is false.
Restored testing, decision, agent, and `pr-review/waiting-on-maintainer` labels remain under human control.
The automatic handoff uses `pr-review/waiting-maintainer` and `pr-review/waiting-on-author`.
The review workflow also creates missing waiting labels.
