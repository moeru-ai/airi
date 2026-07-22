---
title: Anthropic
description: 在 AIRI 中配置 Anthropic Claude 聊天模型
---

Anthropic 服务商让 AIRI 使用 Claude 聊天模型。AIRI 使用 Anthropic 的 API 地址和你的 API Key；模型列表由 AIRI 内置，因此无需手动填写 Base URL 或模型 ID 才能开始。

::: info 为什么选择 Anthropic？
如果你已在使用 Claude API，或希望在 AIRI 中使用 Claude 模型，可以直接选择 Anthropic。
:::

## 第一步：创建 API Key

1. 打开并登录 [Anthropic 控制台](https://platform.claude.com/settings/keys)，创建 API Key，并确认账户已开通 API 使用权限。
2. 为密钥设置适当的名称、有效期和额度限制。
3. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、放入截图，或发送给他人。密钥泄露后，请立即在 Anthropic 控制台撤销它并创建新密钥。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Anthropic**。
2. 将 API Key 粘贴到基础设置。
3. 保留默认 Base URL：`https://api.anthropic.com/v1/`。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，点击此处选择你想要使用的具体模型。

## 排查

Ping API 会检查网络连通性，并发送一条很短的聊天请求。若失败，请确认 API Key 可用、账户有额度，并检查网络是否能访问 Anthropic API。

若模型选择器没有显示预期模型，先更新 AIRI 或在“意识”页面手动输入服务商提供的精确模型 ID。
