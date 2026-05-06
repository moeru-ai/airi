---
title: 桌面端
description: 参与并贡献 Project AIRI
---

### Stage Tamagotchi (桌面端)

```shell
pnpm dev:tamagotchi
```

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr dev:tamagotchi
```

:::

### 实验性 Godot stage 调试

只做 Godot 场景、相机、渲染、状态机一类工作时，使用
`engines/stage-tamagotchi-godot/README.md` 里记录的 editor static preview
路径。本地 VRM fixture 放在被 git 忽略的
`engines/stage-tamagotchi-godot/assets/fixtures/vrm/` 目录下，提交态的
`EditorPreviewRoot` 保持为空。

如果要查看 Electron 开发进程启动出来的 Godot sidecar 运行时场景，先打开
Godot 编辑器，并保持调试服务器开启：

```powershell
& $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
```

然后在同一个已经设置远程调试环境变量的 shell 里启动 Tamagotchi：

```powershell
$env:GODOT_STAGE_REMOTE_DEBUG = "1"
$env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
nr dev:tamagotchi
```

在 Tamagotchi settings 窗口选择 VRM 后，到 Godot 的 `Remote` scene tree
里查看运行时节点：

```text
/root/Node3D/AvatarRoot/Avatar_<modelId>
```

不要用 Godot 编辑器自己的 Run 按钮跑这条链路。编辑器直接运行的进程不会收到
Electron 生成的 `--airi-ws-url`。
