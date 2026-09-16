# Attached HTML file input

Use this method when the target `input[type="file"]` is attached to the document. CSS visibility does not matter: hidden inputs remain addressable by selector.

Inspect candidate inputs and their constraints:

```bash
agent-browser eval 'Array.from(document.querySelectorAll("input[type=file]")).map((input, index) => ({ index, accept: input.accept, multiple: input.multiple, disabled: input.disabled, connected: input.isConnected }))'
```

Trigger the application's upload control first when it creates or enables the input. Then upload with the narrowest stable selector:

```bash
agent-browser upload 'input[type="file"][accept=".zip"]' '/absolute/path/to/archive.zip'
```

For `multiple` inputs, pass every supported absolute path in the same upload operation if the installed Agent Browser command contract permits multiple path arguments. Otherwise assign one complete selection through the command's documented multi-file form; do not upload sequentially when each assignment replaces the previous `FileList`.

Prefer semantic attributes such as `accept`, a stable test attribute, or a label relationship. Avoid positional selectors unless DOM inspection proves that only ordering distinguishes the intended input.

Continue with [verify-upload.md](verify-upload.md).
