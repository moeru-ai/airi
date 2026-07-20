---
title: Microsoft Azure Speech（TTS）
description: 在 AIRI 中配置 Microsoft Azure Speech 语音合成
---

Microsoft Azure Speech 可在 AIRI 中提供 Azure 语音合成能力。

::: info 为什么选择 Microsoft Azure Speech？
如果你的团队已经在 Azure 中管理语音资源和区域配置，使用同一份凭据会更方便。
:::

## 第一步：准备 Azure Speech 资源

1. 打开并登录 [Azure Portal](https://portal.azure.com/)，创建或打开 Speech 资源。
2. 记录资源的 **API Key** 与所属区域；两者必须来自同一 Speech 资源。
3. 复制密钥并妥善保存。

::: warning API Key 安全
Azure 密钥可访问你的语音资源。不要提交、截图或分享它。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → Microsoft / Azure Speech**。
2. 填写 API Key 和区域信息。Base URL 保持界面默认值，除非你使用兼容网关。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络、API Key 和区域是否填写正确。
2. **选择模型和音色**：测试成功后，选择音色，并在 **设置 → 发声** 中启用。
3. 输入短文本试听，确认可正常播放。

## 排查

验证失败时，优先检查区域是否与 Speech 资源一致。没有声音时，确认已在“发声”中选择音色，并检查该资源是否有可用额度。
