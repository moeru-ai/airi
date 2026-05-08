---
name: release-note-writer
description: Write grouped, user-friendly release notes from git history, changelogithub output, GitHub releases, PR lists, or raw commit logs. Use when Codex needs to turn technical changelogs into English-only release notes for AIRI or similar products, including end-user highlights, developer/API notes, contributor-facing internal tooling notes, upgrade notes, or follow-up style-rule updates after wording feedback.
---

# Release Note Writer

## Core Rule

Write release notes in English only. Convert technical history into reader-facing changes grouped by audience and outcome. Do not mirror commit scopes directly.

## Required Discovery

Before drafting, gather the release context:

1. Check the current repo version and tags.
   - Inspect package/version files that already exist in the repo.
   - Inspect recent git tags with `git tag --sort=-v:refname`.
   - Identify the previous release tag.
2. Run changelogithub dry output:
   - `pnpm dlx changelogithub --dry --from <previous-version>`
   - If the command needs network and fails because of sandboxing, request approval and rerun it.
3. Inspect the generated commit structure and then inspect commits directly.
   - Use `git show --stat --oneline <sha>` or equivalent targeted commands.
   - Include chore/internal commits when they affect contributor workflow, tooling, builds, CI, local development, docs generation, test infrastructure, or internal packages.
4. If version boundaries are ambiguous, ask one concise question before drafting.

## Audience Structure

Use a compact, aggregated structure. Prefer fewer major sections with useful subheadings over many small scope-based sections. Use multiple heading levels when that makes the audience or product surface clearer.

Recommended order:

1. Product-facing sections for end users.
2. `### To developers` near the end.
3. `### To contributors` last.
4. `### Upgrade notes` only when action is required.

Product-facing sections can be nested by surface:

- `### Product updates`
- `#### Local`
- `#### Cloud`
- `#### New providers`
- `#### Chat and settings`

Do not force every release into these exact headings. Pick headings that make the release easy to scan.

Use a dedicated bug-fix section when fixes include critical regressions, blocked primary workflows, or issues users may scan the notes to confirm. Critical bugs deserve plain, concrete language because users may be checking whether their blocker was fixed. Minor visual, wording, and low-impact cleanup can stay grouped as polish, but do not bury important fixes inside broad product updates.

Use `To developers` for external developer impact:

- Plugin SDK, plugin manifest, gamelet, widget, extension, public package API, self-host deployment behavior, server-runtime, Docker image behavior, integration contracts.
- Include deployment behavior changes that affect external operators.
- Do not include purely internal `apps/server` business logic unless users of AIRI Cloud or external operators need to act on it.

Use `To contributors` for internal project work:

- `vishot`, `vite-plugin-warpdrive`, `cap-vite`, CI, dev scripts, repo build/test/lint workflow, docs generation, internal-only packages, release automation, test harnesses, screenshots, evaluation tools.
- Include relevant `chore` commits even when changelogithub does not surface them prominently.

## End-User Writing

For UI, `apps/stage-*`, `packages/stage-*`, and `packages/ui` changes, emphasize what the user can now do and what annoyance was removed.

Use patterns like:

- "You can now ..."
- "Previously, ... could ... . We fixed this so ..."
- "We added ... to help you ..."
- "Some ... cases could ... . We cleaned this up so ..."

Avoid exposing implementation names unless they are user-visible product names or provider names. Keep technical terms out of end-user sections when a plain description works.

Release notes should speak from the user's experience, not from the implementation. For fixes, write what the user saw, what workflow was blocked or degraded, and what now works. Do not describe internal causes such as lifecycle order, handler registration, IPC timing, stale stores, or runtime plumbing unless the term is part of the user-facing product. Critical fixes should be plain and concrete, not softened into vague polish.

If commit titles, diffs, tests, and surrounding files do not make the user-facing effect clear, do not invent one. Ask the user one concise question about what happened and how it affected users before drafting that bullet.

Good:

- "You can now retry a failed message directly from the chat."
- "Some provider lists were hard to reach on smaller screens. They now scroll correctly."

Avoid:

- "Refactored `stage-ui` chat action menu state."
- "Fixed provider list CSS overflow in `stage-pages`."

## Provider Section

Create a provider section when provider changes exist. Keep it concise and grouped by capability. Prefer placing it under a product-facing parent when the release has multiple product surfaces, for example `### Product updates` -> `#### Local` -> `##### New providers`.

Example:

```markdown
### Product updates

#### Local

##### New providers

- You can now use Amazon Bedrock as a chat provider.
- You can now use MiniMax Speech as a TTS provider.
- Artistry now supports image providers such as ComfyUI, Replicate, and Nano Banana.
```

## Cloud And Commercial Features

Put account, billing, credits, Flux, Stripe, paid TTS, and commercial usage changes together when they affect users. Use a cloud-related heading only when the release note itself makes the Cloud context understandable.

Prefer:

- "AIRI Cloud now supports server-side TTS with per-character Flux billing."
- "We improved billing reliability for TTS usage, especially when usage needs to be recorded before payment is fully settled."

Avoid assuming `AIRI Cloud` is self-explanatory as a top-level section for every reader. When needed, split it into clearer subtopics such as `Account`, `Billing`, or `Cloud TTS`.

Do not create a broad self-hoster section for internal server details. Mention self-hosting only when there is a required action or externally visible deployment change.

## Tone

Be clear, warm, and lightly playful. The notes may have personality, but the information must stay precise.

Do:

- Use natural sentences.
- Explain the user benefit.
- Group related fixes as "polish" when individual bugs are minor.
- Use a small amount of playful phrasing when it reduces stiffness.

Do not:

- Over-joke.
- Use marketing fluff without behavior.
- Name every internal package.
- Copy commit titles directly.
- Overfit to one example from a past release.

## Feedback Handling

When the user gives wording, grammar, structure, or tone feedback after a draft, ask whether to update this skill with the underlying rule.

Do not add narrow rules like "never write this exact sentence." Instead infer the durable reason:

- audience mismatch
- too much implementation detail
- missing user action
- too many fragmented sections
- too stiff or too casual
- wrong placement between product, developer, contributor, cloud, or upgrade notes

Then propose a concise abstract rule and ask before editing the skill.

## Drafting Workflow

1. Build a fact list from changelogithub and direct commit inspection.
2. Classify each item by audience: end users, providers, cloud/account, developers, contributors, upgrade notes.
3. Merge related commits into one readable bullet.
4. Write bullets in the user's voice: what changed, why it matters, what the reader can do now.
5. Keep commit links out of the main draft unless the user asks for a traceable version.
6. End with upgrade notes only when there is required action.

## Traceable Footnotes

When the user asks for commit traceability, prefer Markdown footnotes over inline commit links. Put footnote markers next to the release-note bullet they support, then list the commit link and author attribution below the notes.

Use footnotes to preserve readable release prose while still declaring where each claim came from and who contributed it. Multiple commits may support one bullet; attach multiple footnotes to that bullet only when each commit adds distinct context.

Format:

```markdown
- User-facing release note sentence.[^1]

[^1]: Commit [`abcdef123`](https://github.com/moeru-ai/airi/commit/abcdef123) by @contributor.
```

Use GitHub handles from changelogithub, PR metadata, or commit metadata when available. If the commit author name differs from the GitHub handle and the handle is not known, use the available author name without inventing a handle.

## Output

Return Markdown unless the user asks for another format.

Example shape:

```markdown
## vX.Y.Z Highlights

### Product updates

#### Account

- ...

#### Local

##### New providers

- ...

##### Experience improvements

- ...

#### Cloud

##### Billing

### To developers

- ...

### To contributors

- ...

### Upgrade notes

- ...
```

This is an example, not a required template. Adjust section names and heading depth to match the actual release. Do not emit empty sections.
