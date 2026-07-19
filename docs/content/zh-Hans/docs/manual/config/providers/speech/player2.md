---
title: Player2 Speech（TTS）
description: 在 AIRI 中连接本地 Player2 Speech 服务
---

Player2 Speech 是通过本地服务连接的语音合成选项。

::: info 为什么选择 Player2 Speech？
如果你已在本机或可信局域网运行 Player2 Speech，可以将 AIRI 连接到该服务并读取它提供的音色。
:::

## 第一步：启动本地服务

1. 启动 Player2 Speech 服务，并确认健康检查可用。
2. AIRI 默认连接 `http://localhost:4315/v1/`；如果服务运行在其他地址，请记录完整 Base URL。

::: warning 本地服务安全
不要将本地服务端口暴露到不受信任的公共网络。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → Player2 Speech**。
2. 填写与服务地址一致的 Base URL。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试 AIRI 是否能连接该服务。
2. **选择模型和音色**：测试成功后，选择 `player2-tts` 与服务返回的声音，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

连接失败时，检查服务的 `/health` 响应和 Base URL。音色列表为空时，确认服务的 `/tts/voices` 接口可访问。
