---
title: 阿里云百炼（TTS）
description: 在 AIRI 中配置阿里云百炼语音合成
---

阿里云百炼可在 AIRI 中提供 CosyVoice 语音合成模型。

::: info 为什么选择阿里云百炼？
如果你已使用阿里云百炼，并希望在 CosyVoice 音色与模型中选择，这是直接的接入方式。
:::

## 第一步：获取 API Key

1. 打开并登录[阿里云百炼控制台](https://bailian.console.aliyun.com/)，确认已开通模型服务。
2. 在 API Key 管理页面创建密钥。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将百炼 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → Alibaba Cloud Model Studio**。
2. 将百炼 API Key 粘贴到基础设置；Base URL 使用界面默认值，除非你配置了兼容网关。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择 CosyVoice 模型与音色，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

Ping API 失败时，检查 API Key、账户额度和网络连接。模型或音色不可选时，确认百炼账户已开通相应模型。
