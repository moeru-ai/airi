---
name: upload-github-attachment
description: Upload a local image or file to GitHub's user-attachments storage and return a URL suitable for issue, pull request, discussion, or comment Markdown. Use when Codex must embed local screenshots, videos, logs, or other evidence in GitHub content without committing the files to a repository.
---

# Upload GitHub Attachment

Use the bundled script so authentication, repository resolution, MIME detection, and URL extraction remain consistent.

## Requirements

- Require the `gh` CLI and `curl`.
- Prefer an existing `gh auth login` session.
- When interactive `gh` authentication is unavailable, require `GH_TOKEN` or `GITHUB_TOKEN` in the environment.
- Stop and ask the user to configure one of those authentication methods if `gh auth token` cannot resolve a token. Never print, persist, or interpolate the token into diagnostic output.

## Upload

Run from a checkout of the destination repository:

```bash
.agents/skills/upload-github-attachment/scripts/upload-github-attachment.sh /absolute/path/to/image.png
```

Specify the repository when the current directory cannot resolve it:

```bash
.agents/skills/upload-github-attachment/scripts/upload-github-attachment.sh \
  --repo moeru-ai/airi \
  /absolute/path/to/image.png
```

The script prints only the final `https://github.com/user-attachments/assets/...` URL. Embed it with `![](URL)` for an image or `[label](URL)` for another file.

## Verification

1. Request the returned URL and follow redirects.
2. Require HTTP 200 and the expected content type.
3. After creating or editing the GitHub content, reopen it and verify that the attachment renders.

The upload endpoint is currently undocumented by GitHub. Treat a rejected request as a blocking capability change instead of falling back to committing PR-only artifacts. Background and the observed Bearer-token flow: <https://island94.org/2026/08/programmatically-upload-attachments-to-github-issues-pull-requests-comments>.
