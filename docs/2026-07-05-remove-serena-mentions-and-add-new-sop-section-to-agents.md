# Plan: Strip serena references, add new SOP section

## Context
AGENTS.md currently references the `serena` MCP tool across operation tables, subagent prompt template, verification steps, memory workflow, and cheat-sheet. Since serena is no longer used as a primary tool, remove every mention and add the new `Standard Operating Procedure — Local Helper Scripts` section.

## Step-by-step edits

### 1. Remove "PRIMARY (serena)" column entries from Symbol & Declaration table (lines 44-56)
For each row, drop the serena column value. Table becomes 2-col (jcodemunch | Grep fallback). Remove rows where serena was the only primary (e.g. "Find declaration location", "Rename symbol globally", "Replace single symbol body", "Insert after/before symbol", "Replace content", "Bulk replace").

### 2. Remove serena entries from Call Hierarchy table (lines 74-79)
Caller trace drops `serena___find_referencing_symbols`; Callee trace drops the empty stub row.

### 3. Delete entire "Serena Project Memory" section (lines ~110-125)
All `serena___list_memories` / `_read_memory` / `_write_memory` / `_edit_memory` / `_delete_memory` / `_rename_memory` entries removed.

### 4. Simplify "Tools — Mandatory Binding Table" intro (line 41)
Drop "PRIMARY (serena)" label from table reference; only jcodemunch remains.

### 5. Rewrite Session Startup Protocol (lines 170-178)
Remove serena steps 1 & 2. New protocol:
```
1. `jcodemunch___resolve_repo("/home/vi/anima")` → assert repo id is `"airi"`
```

### 6. Update Subagent Prompt Template (lines 217-243)
Drop `serena: ...` tool block. Update primary flow to:
```
Primary flow: get_outline -> search_units -> get_unit -> get_blast_radius -> apply edit via native tools -> register_edit
```

### 7. Update Step 3: Verify (lines 252-259)
Drop `serena___get_diagnostics_for_file` verification step.

### 8. Remove Memory Write Policy section (lines 261-267)
Entire section deleted (references serena memory tools).

### 9. Update Tool Selection Cheat-Sheet (lines ~276-326)
Remove serena entries from:
- Opening move
- Locate target
- Apply edit
- Verify & reindex

### 10. Add new SOP section
Insert after Lessons Learned section, before Tool Selection Cheat-Sheet:

```markdown
## Standard Operating Procedure — Local Helper Scripts

The following scripts are installed at `~/.agents/skills/`. Use them when the
situation calls for it. Soft guidance — apply judgment, not dogma.

### auto-execute (plan runner)
`~/.agents/skills/auto-execute/auto-execute.sh`
[... rest of user-provided content ...]
```

## Verification
After edits, `rg -i serena AGENTS.md` should return zero matches.
