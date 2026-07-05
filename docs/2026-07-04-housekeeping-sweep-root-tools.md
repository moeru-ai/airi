Sweep stale root-level files (all are one-off fix scripts from Jun-26 JSCpd + an old deepsource dump). No dependents anywhere in the repo.

```bash
cd /home/vi/anima
git checkout main   # already on main

# trash 10 stale root files — all untracked-relevant only for these; none touched by the agent WIP
git rm \
  fix_vi_fn.py fix_all_js0116.py fix_corrupted.py fix_js0116.py \
  fix_orchestrator.py fix_providers.py fix_providers_careful.py fix_providers_v2.py \
  scan_detail.py scan_remaining.py \
  ds-issues.json

git status --porcelain   # sanity: only the deletions plus unchanged WIP files
git commit -m "chore: housekeeping — sweep leftover lint-fix scripts and deepsource dump"
git push origin main
```

Verification before push:
- Confirm WIP files untouched (all untracked in `apps/stage-tauri/src/`).
- Confirm no remaining `*fix_*.py`/`scan_*.py`/`ds-issues.json` at root.