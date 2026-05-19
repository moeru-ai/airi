# Live Debugging From The Godot Editor

Use this workflow when Electron is the real host and the model is selected from
the Tamagotchi settings window, but the imported runtime scene needs to be
inspected in the Godot editor.

## Required Process Order

1. Start the Godot editor against this project:

   ```powershell
   & $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
   ```

2. In the Godot editor, enable:

   ```text
   Debug -> Keep Debug Server Open
   ```

3. Start the Electron development app from a shell that already has remote
   debugging enabled:

   ```powershell
   $env:GODOT_STAGE_REMOTE_DEBUG = "1"
   $env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
   nr dev:tamagotchi
   ```

4. In the Tamagotchi settings window, start the experimental Godot stage and
   select a VRM model.

5. In the Godot editor, inspect the running scene:

   ```text
   Scene dock -> Remote -> /root/Node3D/AvatarRoot/Avatar_<modelId>
   ```

Do not use the editor's Run button for this integration path. The editor-run
process does not receive Electron's `--airi-ws-url`, so it cannot show the model
materialized by Tamagotchi and sent over the sidecar WebSocket.

## How It Works

When `GODOT_STAGE_REMOTE_DEBUG=1` is set, Electron launches the Godot sidecar
with Godot debugger arguments before the engine `--` separator:

```text
--remote-debug tcp://127.0.0.1:6007
```

The sidecar process also receives `--airi-ws-url=<runtime-url>` after the
separator so `StageRoot` can connect back to Electron main.

## Troubleshooting

If the Godot editor only shows the local scene tree:

- Confirm the Godot editor was started before the sidecar.
- Confirm `Debug -> Keep Debug Server Open` is enabled.
- Confirm `nr dev:tamagotchi` was started after setting
  `GODOT_STAGE_REMOTE_DEBUG=1`.
- Close the Godot stage sidecar window and start it again from the Tamagotchi
  settings window.
- On Windows, confirm the editor is listening:

  ```powershell
  Get-NetTCPConnection -LocalPort 6007
  ```

- Confirm the sidecar process includes `--remote-debug` and `--airi-ws-url`:

  ```powershell
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -like '*Godot*' } |
    Select-Object ProcessId,CommandLine
  ```

If the imported model is distorted, first verify that the runtime importer uses
the same named-skin-bind flag as the V-Sekai editor importer. The AIRI runtime
import path defines this as `IMPORT_USE_NAMED_SKIN_BINDS := 16` in
`scripts/vrm/VrmRuntimeImporter.gd`.

If a `.vrm` file imports correctly in the Godot editor but does not appear
through the sidecar runtime path, check the file's glTF extension keys. The
current AIRI runtime bridge covers the VRM 0.x `extensions.VRM` path. VRM 1.0
files use `extensions.VRMC_vrm` and require the vendored `addons/vrm/1.0/VRMC_*`
extensions to be registered in the runtime importer before support can be
claimed.
