---
name: enforce-rules-for-i18n
description: Review pending AIRI translations on Crowdin in a batch, then sync them into the repository. Use when Crowdin has translations that wait for approval, when translations have not reached the repository for days, or when the user pastes output of pending-review.mjs.
---

# Crowdin batch review for AIRI

This skill reviews the translations that wait for approval on the AIRI Crowdin project. An agent judges each translation. A person applies the result with their own token.

## Requirements

- Node.js 24 or later, and `pnpm install` in this repository. The check script imports the placeholder rule from `.github/scripts/check-locales.ts`.
- A Crowdin personal access token with proofreader or manager access to the AIRI project. Create it in Crowdin: Account Settings → API → Personal Access Tokens.
- The project id defaults to `816610`, the id in `crowdin.yml` of `moeru-ai/airi`. To use another project, set `CROWDIN_PROJECT_ID`.

## Token rules

- The person sets the token in their own terminal. The agent never asks for, reads, prints, or passes the token.
- Set the token for the current terminal only. Do not write it into a shell profile.

```bash
read -rs "CROWDIN_PERSONAL_TOKEN?Crowdin token: " && export CROWDIN_PERSONAL_TOKEN
```

The command above is for zsh. In bash, use `read -rsp "Crowdin token: " CROWDIN_PERSONAL_TOKEN && export CROWDIN_PERSONAL_TOKEN`.

## Workflow

The scripts read and write their files in the current directory. Run them from a work directory outside the repository, so the review files stay out of Git. `<repo>` is the root of this repository.

1. **Check (person runs).** This step is read-only.

   ```bash
   node <repo>/.agents/skills/enforce-rules-for-i18n/scripts/pending-review.mjs
   ```

   It prints a table for each language. It writes `crowdin-pending-review.json` with all pending translations. It writes `crowdin-pending-review.md` with the flagged ones only: placeholder mismatch, same as English, and bad whitespace.

   If the table shows 0 pending, there is nothing to review. Go to step 5.

2. **Review (agent).** Read `crowdin-pending-review.json` and judge every entry with the policy below. Write `crowdin-review-decisions.json`:

   ```json
   {
     "approve": [{ "languageId": "es-ES", "file": "stage.yaml", "key": "a.b", "text": "..." }],
     "reject": [{ "languageId": "es-ES", "file": "stage.yaml", "key": "a.b", "text": "...", "reason": "..." }]
   }
   ```

   Generate this file from the JSON with a script. Do not type `file`, `key`, or `text` by hand. The apply script matches the exact text.

3. **Dry run (person runs).**

   ```bash
   node <repo>/.agents/skills/enforce-rules-for-i18n/scripts/apply-review.mjs
   ```

   The output must end with `All matched.` If one entry does not match, the script stops and changes nothing.

4. **Apply (person runs).**

   ```bash
   node <repo>/.agents/skills/enforce-rules-for-i18n/scripts/apply-review.mjs --approve --delete-rejected
   ```

   Before it deletes, the script writes a backup to `crowdin-rejected-backup-<timestamp>.json`.

   Then run step 1 again. A deleted translation can uncover an older suggestion for the same string. Review the new entries until pending is 0.

5. **Sync.** The `crowdin-cron-sync.yml` workflow exports approved translations once a day. To sync now, run it manually from GitHub Actions. It updates the `chore(i18n): update translations` pull request.

## Review policy

Reject a translation when:

- It is the same as the English text, even when the word is correct in that language, for example `OK`, `Error`, or a brand name. AIRI shows the English text for a string without a translation. Crowdin does not import a translation that is the same as the source.
- It has the wrong meaning or the wrong part of speech, for example a noun label translated as a verb phrase.
- Its placeholders differ from the English text: `{name}`, `{0}`, or `@:key`.
- It contains a literal `\n` where the English text has a line break.

Approve a translation when its meaning is correct, even if it has small style problems. List those problems in the report, so a translator can fix them on Crowdin. Do not reject a translation only for style.

Compare terms with the existing translations in `packages/i18n/src/locales/<locale>/`. Some Crowdin language ids differ from the folder names:

| Crowdin | Folder |
| --- | --- |
| `es-ES` | `es` |
| `zh-CN` | `zh-Hans` |
| `zh-TW` | `zh-Hant` |

Language notes:

- Spanish uses "tú", not "usted". Spanish titles use sentence case.

The report to the person has three parts: the counts, a table of rejected translations with the reasons, and a short list of approved translations that have style problems.

## Warnings in the sync pull request

- "Same translation as <other key>, whose English has no word in common" is a heuristic. It checks only strings that changed against `main`. After the pull request merges, the warning does not come back. Do not add an allowlist.
- Synonyms cause false positives, for example "Settings" and "Configuration". If the older key on `main` has the wrong translation, fix that key on Crowdin.
- A new quote, for example `error: '错误：'`, comes from Crowdin. It copies the quotes of the English source string. The value does not change.

## Fixing one approved translation

The batch scripts handle pending translations only. When an approved translation is wrong, write a small script for that string:

1. Find the string by its file and key.
2. Without `--apply`, print all translations of the string in that language and their approval state.
3. With `--apply`, write a backup, add and approve the correct text, and delete the other translations of the string in that language.
