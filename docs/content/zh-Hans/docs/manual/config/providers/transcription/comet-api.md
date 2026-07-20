---
title: CometAPI（ASR/STT）
description: 在 AIRI 中配置 CometAPI 语音识别
---

CometAPI 通过其兼容接口提供音频转写。

::: info 为什么选择 CometAPI？
如果你已使用 CometAPI 管理模型和凭据，可在 AIRI 中直接复用同一 API Key 进行语音识别。
:::

## 第一步：获取 API Key

1. 打开并登录 [CometAPI 控制台](https://www.cometapi.com/console/token)，创建 API Key。
2. 确认账户可访问音频转写模型，复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音识别 → CometAPI Transcription**，填写 API Key。
2. 保留默认 Base URL：`https://api.cometapi.com/v1/`；只有使用代理或兼容网关时才修改。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，选择可用转写模型；再到 **设置 → 听觉** 启用。
3. 允许麦克风访问并进行一段短语音输入，确认文字可输出。

## 排查

Ping API 失败时，检查 API Key、账户权限和网络连接。没有文字结果时，确认 AIRI 已获得系统麦克风权限。
