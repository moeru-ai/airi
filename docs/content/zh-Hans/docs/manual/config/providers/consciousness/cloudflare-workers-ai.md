---
title: Cloudflare Workers AI
description: 在 AIRI 中配置 Cloudflare Workers AI 聊天模型
---

Cloudflare Workers AI 使用账户级凭据。除 API Token 外，AIRI 还需要 Cloudflare Account ID 才能定位你的 Workers AI 资源。

::: info 为什么选择 Cloudflare Workers AI？
如果你的模型服务已部署在 Cloudflare 账户中，使用 Workers AI 能直接复用该账户的 Token 与 Account ID。
:::

## 第一步：准备凭据

1. 打开 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)，创建具有 Workers AI 访问权限的 API Token。
2. 复制该 Token。
3. 在 [Cloudflare 控制台](https://dash.cloudflare.com/)中找到并复制 Account ID。

::: warning 安全提醒
API Token 与账户权限绑定。请遵循最小权限原则，只授予 AIRI 所需的 Workers AI 权限；不要将 Token 或 Account ID 与公开日志一同发布。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Cloudflare Workers AI**。
2. 填写 **API Token** 与 **Account ID**。

## 第三步：验证配置

1. 确认基础凭据验证通过。
2. **选择模型**：测试成功后，点击此处选择你想要使用的具体模型。

## 排查

若 AIRI 提示凭据无效，分别检查 Token 权限和 Account ID 是否来自同一个 Cloudflare 账户。此服务商不使用可编辑的 Base URL，因此不应将 Worker URL 或 API 路径填入任何字段。
