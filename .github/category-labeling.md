# Copilot category labels

Category triage runs when an issue or PR opens, reopens, or changes content.
It also runs for issue type changes, new PR commits, and changes to PR draft status.
The dispatcher calls `copilot-labels.yml` on the default branch.

The workflow reads the item title, body, issue type, and changed PR file paths.
Copilot CLI `1.0.91` uses the `COPILOT_GITHUB_TOKEN` secret and automatic model selection.
The CLI process has no tools, built-in MCP servers, or GitHub write token.
GitHub Actions validates the returned JSON array before applying labels.
Invalid JSON, unknown labels, duplicate labels, and conflicting type labels stop the run before label changes.

The category allowlist is in `workflows/copilot-labels.yml`.
It includes `bug`, `feature`, app areas, environment labels, and scopes.
Humans manage priorities, questions, information requests, and PR review status.
The category workflow never adds or removes those labels.

To classify an existing item, run:

```sh
gh workflow run copilot-labels.yml --repo moeru-ai/airi -f item_number=2803
```

The workflow becomes available for dispatch after it reaches the default branch.
To check output validation, run:

```sh
pnpm exec vitest run --project github-scripts .github/scripts/copilot-labels.test.ts
```
