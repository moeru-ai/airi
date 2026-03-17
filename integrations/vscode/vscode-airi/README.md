# AIRI VSCode Plugin

Official VSCode bridge for AIRI.

## Channel design

- Extension module id: `proj-airi:vscode-airi`
- Host aggregator module id: `proj-airi:airi-plugin-vscode`
- This extension sends `context:update` activity events with route target `plugin:proj-airi:airi-plugin-vscode`.
- The host plugin aggregates cross-instance/workspace activity and emits one summarized `context:update` back to Stage UI.
- Model configuration can be pushed from UI into the host plugin (`ui:configure`), then forwarded to VSCode instances via `module:configure`.
