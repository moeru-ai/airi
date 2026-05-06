---
title: Desktop
description: Contribute to Project AIRI
---

### Stage Tamagotchi (Desktop version)

```shell
pnpm dev:tamagotchi
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr dev:tamagotchi
```

:::

### Experimental Godot stage debugging

For Godot-only scene work, use the editor static preview path documented in
`engines/stage-tamagotchi-godot/README.md`. Local VRM fixtures belong under the
ignored `engines/stage-tamagotchi-godot/assets/fixtures/vrm/` directory, and the
committed `EditorPreviewRoot` stays empty.

To inspect the Godot sidecar scene that is launched by the Electron development
app, open the Godot editor first and keep its debug server open:

```powershell
& $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
```

Then start Tamagotchi from a shell with remote debugging enabled:

```powershell
$env:GODOT_STAGE_REMOTE_DEBUG = "1"
$env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
nr dev:tamagotchi
```

Select a VRM model from the Tamagotchi settings window, then inspect the runtime
scene in Godot's `Remote` scene tree:

```text
/root/Node3D/AvatarRoot/Avatar_<modelId>
```

Do not use the Godot editor Run button for this flow. The editor-run process
does not receive Electron's `--airi-ws-url`.
