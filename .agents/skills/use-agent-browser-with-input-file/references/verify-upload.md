# Verify an upload

Verify the deepest observable result instead of stopping when `agent-browser upload` exits successfully.

Treat these as separate checkpoints:

1. **Assignment:** the intended input received the expected file or files.
2. **Processing:** the application emitted the expected filename, preview, validation result, progress state, or imported record.
3. **Persistence:** the application retained the new selection in its store, database, or subsequent route when persistence is part of the contract.
4. **Consumption:** the destination viewer, editor, renderer, or submission flow used the uploaded content.

Re-snapshot after assignment and wait on an application-specific postcondition. A filename rendered by the browser's input control proves assignment only. Likewise, an imported card does not prove that a renderer can consume the file.

Inspect diagnostics at the final checkpoint:

```bash
agent-browser errors
agent-browser console
```

Capture evidence that distinguishes the uploaded file from default or previously cached data. Report the first failing checkpoint and the relevant error rather than collapsing the whole flow into a single pass/fail result.
