# @proj-airi/airi-plugin-vscode

Host-side channel aggregator for VSCode integration.

## What it does

- Connects to `@proj-airi/server-runtime` as module `proj-airi:airi-plugin-vscode`.
- Receives `context:update` activity events from many `vscode-airi` extension instances.
- Aggregates usage across workspaces/instances and periodically emits a summarized `context:update` for Stage UI.
- Accepts `module:configure` (forwarded from `ui:configure`) to apply runtime settings, including preferred model.
- Broadcasts configured model down to all VSCode instances via targeted `module:configure`.

## Expected `ui:configure` payload

Use module name `proj-airi:airi-plugin-vscode` and send:

```json
{
  "model": {
    "provider": "openai",
    "model": "gpt-4.1"
  },
  "emitIntervalMs": 5000,
  "maxWorkspaces": 12,
  "maxInstances": 32
}
```
