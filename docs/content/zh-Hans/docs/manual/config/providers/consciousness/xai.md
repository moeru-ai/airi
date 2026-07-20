---
title: xAI
description: 在 AIRI 中配置 xAI Grok 聊天模型
---

xAI 服务商让 AIRI 使用 Grok 聊天模型。其配置方式与常见 API Key 服务商相同。

::: info 为什么选择 xAI？
如果你已有 xAI API 账户，并希望在 AIRI 中使用 Grok 模型，可以选择该服务商。
:::

## 第一步：创建 API Key

1. 在 xAI 开发者控制台创建 API Key。
2. 确认账户已开通 API 用量并有可用额度。
3. 复制密钥。

::: warning API Key 安全
只在密码管理器或 AIRI 的本地设置中保存 API Key。不要把密钥写入代码、提交到仓库或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → xAI**。
2. 填写 API Key。
3. 保留默认 Base URL：`https://api.x.ai/v1/`。

### 3. 配置校验

1. **Ping API**: 点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**: 测试成功后，点击此处选择你想要使用的具体模型。

## 排查

如果 Ping API 失败，请先检查 API Key、账户额度和网络连接。模型列表不可用时，可以在“意识”页面手动填写 xAI 文档中给出的模型 ID。
