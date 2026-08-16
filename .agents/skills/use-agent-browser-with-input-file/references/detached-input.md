# Dynamically created or detached HTML file input

Use this method when clicking the application control creates an input only briefly, or when a framework file-dialog helper calls `input.click()` without attaching the input to the document. Agent Browser cannot select a detached node with a CSS selector, so expose it temporarily within the browser test session.

## Confirm the behavior

Inspect the DOM before and after clicking the control. If no input remains connected, install the bridge before triggering the file dialog:

```bash
agent-browser eval 'window.__agentBrowserOriginalFileInputClick ??= HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type === "file") { this.dataset.agentBrowserUpload = "true"; document.body.append(this); return; } return window.__agentBrowserOriginalFileInputClick.call(this); }; true'
```

The bridge preserves ordinary clicks and intercepts only file inputs. It prevents the native chooser from opening, marks the exact input created by the application, and attaches that same node so its existing `change` listener remains intact.

Trigger the application's choose/import action, inspect the captured input, and upload using both the marker and the expected constraints:

```bash
agent-browser eval 'Array.from(document.querySelectorAll("input[data-agent-browser-upload]"), input => ({ accept: input.accept, multiple: input.multiple, connected: input.isConnected }))'
agent-browser upload 'input[data-agent-browser-upload][accept=".zip"]' '/absolute/path/to/archive.zip'
```

If several inputs were captured, narrow the selector by `accept`, `multiple`, or another application-owned attribute. Do not upload to all marked inputs.

## Restore the page

Wait until the application's `change` handler has consumed the file, then restore the prototype and remove only nodes created by this bridge:

```bash
agent-browser eval 'if (window.__agentBrowserOriginalFileInputClick) { HTMLInputElement.prototype.click = window.__agentBrowserOriginalFileInputClick; delete window.__agentBrowserOriginalFileInputClick; } document.querySelectorAll("input[data-agent-browser-upload]").forEach(input => input.remove()); true'
```

Keep the bridge scoped to a disposable test session. It is runtime instrumentation for automation, not application code to commit.

Continue with [verify-upload.md](verify-upload.md).
