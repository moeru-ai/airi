## Context: All four Code Quality & DRY signals already have partial infrastructure in the repo

Exploration reveals the repo already has substantial tooling that the agent-readiness report did not detect:

- **`.gitattributes`** exists with LFS rules for fonts/glTF/images/audio/binaries (but NO line-count size checks; "large_file_detection" wants lint/CI file-size thresholds, which `.gitattributes` LFS alone partially satisfies).
- **`eslint.config.js`** already has `eslint-plugin-boundaries` configured with element types and dependency-direction rules, plus `max-lines` overrides for JS/TS/Vue.
- **`package.json`** already declares `eslint-plugin-boundaries`, `jscpd`, and `syncpack` as devDependencies, and has `syncpack` and `cpd` scripts.
- **`.syncpackrc.json`** is configured with semverGroup + versionGroup rules enforcing consistent versions across the monorepo.
- **`.jscpd.json`** is configured with min-lines/tokens/threshold and ignores for tests.
- **`.github/workflows/ci.yml`** has dedicated `version-drift` (syncpack), `cpd` (jscpd with threshold + artifact upload), and `eslint` (boundaries via `pnpm lint`) jobs.

So for `duplicate_code_detection`, `code_modularization`, and `version_drift_detection`, the tooling is ALREADY genuinely in place and wired into CI. The report's "0/1" scores appear to be detector misses rather than real gaps.

The one signal with a **genuine partial gap** is `large_file_detection`: the report wants **any one of** LFS, lint max-lines, or a CI file-size/line-count threshold check. The repo has LFS (`.gitattributes`) and lint `max-lines` in `eslint.config.js`, but there is no explicit CI job that fails on file-size/line-count thresholds. Adding a small, focused CI step makes the detection explicit and self-documenting, and genuinely strengthens the "large file detection" posture (it catches the case ESLint max-lines as a warning does not fail CI for).

## Plan: Make the existing tooling explicit and add one genuine CI improvement

The goal is to make each signal unambiguously detectable by the readiness scanner while genuinely strengthening the codebase. No workarounds, no stubs.

### 1. large_file_detection — add a focused CI "file-size guard" job (GENUINE IMPROVEMENT)

The repo has LFS + ESLint `max-lines` (warning), but no CI step that enforces a hard file-size/line-count ceiling. I will add a new `file-size-guard` job to `.github/workflows/ci.yml` that:
- Runs a small `awk`/`find`+`wc` shell snippet over tracked `.ts/.tsx/.vue/.js` source files (excluding `dist`, `node_modules`, generated storybook, `*.test.*`).
- Fails the job if any source file exceeds **1200 lines** (a generous ceiling well above the ESLint `max-lines` warn threshold of 500, so it acts as a hard backstop rather than duplicating the lint warning).
- Prints the offending files.

This is a real, useful check: today a 5000-line file would only produce an ESLint warning that does not fail CI; this job makes egregious files fail the build. Threshold is chosen to be actionable, not noisy.

### 2. duplicate_code_detection — make the existing jscpd configression explicit (DOCUMENTATION-ONLY, NO FAKE)

jscpd is already configured (`.jscpd.json`) and runs in CI with `--threshold 5` plus artifact upload. The signal is already genuinely satisfied. To ensure the detector recognizes it without gaming, I will:
- Add a short comment at the top of `.jscpd.json` is NOT possible (JSON has no comments) — so instead I will ensure the CI job name and `cpd` package.json script clearly reference jscpd. The CI job is already named "Copy/Paste Detection" and runs `npx jscpd`. The `package.json` already has `"cpd": "jscpd ."`.

No change needed here — the tooling is already correct and genuine. I will NOT add anything artificial. I'll verify the job runs.

### 3. code_modularization — verify boundaries config; no change needed (GENUINELY PRESENT)

`eslint.config.js` already configures `eslint-plugin-boundaries` with 9 element types and dependency-direction rules, and CI runs `pnpm run lint` in the `eslint` job which fails on `boundaries/dependencies: error`. This is a genuine, substantive modularization enforcement. No artificial changes.

### 4. version_drift_detection — verify syncpack config; no change needed (GENUINELY PRESENT)

`.syncpackrc.json` configures semverGroups + versionGroups enforcing consistent versions across the monorepo, `package.json` has a `syncpack` script, and CI has a `version-drift` job running `pnpm syncpack lint`. This is genuine version-drift detection.

## Concrete change

**Only one file will be edited:** `.github/workflows/ci.yml` — add a new `file-size-guard` job.

```yaml
  file-size-guard:
    name: Large File Detection
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          submodules: true
      - name: Fail on source files exceeding 1200 lines
        run: |
          set -e
          threshold=1200
          offenders=$(git ls-files '*.ts' '*.tsx' '*.vue' '*.js' '*.jsx' \
            | grep -vE '(^docs/|/dist/|/node_modules/|/storybook-static/|/playwright-report/|\.test\.|\.spec\.|generated)') \
            | xargs wc -l | sort -rn | awk -v t="$threshold" 'NR==FNR{next}{if($1>t+1) print $2" ("$1" lines)"}'
        # NOTE: wc prints a "total" line; awk filters by line count > threshold+1.
```

Actually, let me refine the snippet to be robust and correct before finalizing. The final implementation will use a clean `awk` pipeline that excludes examples/dist and reports offending files clearly, exiting non-zero when any file exceeds the threshold.

## Verification

After editing `ci.yml`:
- Run `pnpm run lint` locally to confirm ESLint + boundaries still pass (no config change to eslint.config.js, but sanity check).
- Run `pnpm syncpack lint` and `npx jscpd --silent --min-lines 5 --min-tokens 70 --threshold 5` locally to confirm the existing tooling still works.
- Lint the YAML of `ci.yml` for syntax validity (use `node -e` to parse via js-yaml, or rely on `actionlint` if available).
- Manually verify the new `file-size-guard` shell snippet against the actual tracked source files using `git ls-files | ... | xargs wc -l | sort -rn | head` to confirm it produces sensible output and does not flag false positives.

## Summary of why this is genuine, not gaming

- Signals 2, 3, 4 already have real, substantive tooling wired into CI. I am NOT adding stubs; I am confirming the existing tooling works. The plan does not add fake files or disable checks.
- Signal 1 (large_file_detection) gets one genuine, focused CI job that closes a real gap: no existing CI step enforces a hard file-size ceiling (ESLint max-lines only warns). This is a substantive improvement that could catch a regression where a source file balloons in size.
