# Nix Build System Notes

## pnpm CAFS Store Merging (2026-04-07)

### Problem
When merging multiple per-package pnpm CAFS (Content-Addressable File Store) fragments into a single store using `lib.concatStringsSep` without a trailing newline, the last package in the list was skipped during the merge.

**Symptom**: 2989 out of 2990 packages in the merged store; specifically, the last package (zwitch@2.0.4) was missing from the final index.

### Root Cause
The merge process reads package store paths from a temporary file using bash's `while IFS= read -r line` loop:

```bash
while IFS= read -r store; do
  [ -z "$store" ] && continue
  # process $store
done < "$pkgStoresListPath"
```

When a file has no trailing newline, `read` fails to read the last line. This is standard bash behavior:
- `read` returns success only if it reads a complete line (ending with `\n`)
- If EOF is reached without a newline, the line is silently dropped

**Nix context**: `lib.concatStringsSep "\n" (lib.attrValues pkgStores)` produces:
```
/path/to/store1
/path/to/store2
...
/path/to/storeN
```

Note the **missing trailing newline** after the last path.

### Solution
Explicitly add a trailing newline:

```nix
pkgStoresList = (lib.concatStringsSep "\n" (lib.attrValues pkgStores)) + "\n";
```

Result in the temporary file:
```
/path/to/store1
/path/to/store2
...
/path/to/storeN
                <- now has trailing newline
```

### Verification
After the fix:
- Merged store has 2990 index files (all packages, including zwitch)
- Total CAFS files: 104,623
- Store size: 6.0 GB
- `.fetcher-version`: 2 (pnpmConfigHook expects this)

### Key Learnings
1. **Shell `read` behavior**: Always ensure files end with a newline when using bash loops, especially with `read` in pipes/redirects.
2. **passAsFile in Nix**: When using `passAsFile` to avoid ARG_MAX limits, the temporary file content depends exactly on the Nix expression. String concatenation without trailing delimiters can cause data loss.
3. **Debugging technique**: Add temporary output to stderr (`>&2`) to trace variable values during Nix builds. Use `nix log .#<attr>` to retrieve build logs.
4. **pnpm CAFS format**: v10 stores files at `v10/files/{hex[:2]}/{hex[2:]}-{-exec?}` and indexes at `v10/index/{hex[:2]}/{hex[:64]}-{name}@{version}.json`.

### Related Code
- `nix/pnpm-store.nix`: Merge derivation
- `nix/scripts/cafs-add.mjs`: Per-package CAFS generation with executable suffix `-exec`
- Commit: `5912da6f` (this fix)
