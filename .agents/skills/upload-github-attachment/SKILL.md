---
name: upload-github-attachment
description: Attach a local image or video to a GitHub issue, pull request, or comment with the official GitHub CLI flow. Use when Codex must embed local visual evidence without committing the files to a repository.
---

# Upload GitHub Attachment

Use the official GitHub CLI attachment flow. It uploads the file and binds the asset to the issue, pull request, or comment in one operation.

## Requirements

- Require GitHub CLI 2.99.0 or later.
- Require push access to the destination repository.
- Use an existing `gh auth login` session, `GH_TOKEN`, or `GITHUB_TOKEN`.
- Stop if `gh auth token` cannot resolve a token.
- Never print, persist, or add the token to diagnostic output.
- Upload only the image and video formats that `gh --attach` accepts.

Do not call `https://uploads.github.com/user-attachments/assets` directly. The endpoint can return a URL that requires authentication even for a public repository.

## Attach a File

Put the local path where the attachment must appear in the Markdown body:

```markdown
![Flux history after](./captures/flux-history.png)
```

Pass the same path to the GitHub command. Add the alt text after `#`:

```bash
gh pr edit 2491 \
  --repo moeru-ai/airi \
  --body-file /tmp/pr-body.md \
  --attach './captures/flux-history.png#Flux history after'
```

Use `--attach` with `gh pr create`, `gh pr edit`, `gh pr comment`, `gh issue create`, `gh issue edit`, or `gh issue comment`.

Repeat `--attach` for each file. GitHub CLI replaces matching local Markdown paths with `https://github.com/user-attachments/assets/...` URLs. It appends an attachment when the body does not contain its path.

If a caller needs the final URL, read the saved body or comment after the command succeeds. Do not create an unbound asset only to obtain a URL.

## Verification

1. Read the saved GitHub body or comment.
2. Make sure that no local attachment path remains.
3. Request each final asset URL and follow redirects.
4. For a public repository, require an anonymous HTTP 200 response and the expected media type.
5. For a private or internal repository, require an authenticated HTTP 200 response and the expected media type.
6. Reopen the GitHub content and make sure that each attachment renders.

For a public repository, reject an asset that returns anonymous HTTP 404 and authenticated HTTP 200. This result means that the asset is not public.

If `gh --attach` is unavailable or fails, stop and report the failure. Do not use the old direct-upload endpoint. Do not commit PR-only artifacts as a fallback.

GitHub documentation: <https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli>.
