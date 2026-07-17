---
title: 小米 MiMo
description: 在 AIRI 中配置小米 MiMo 聊天模型
---

小米 MiMo 在 AIRI 中提供聊天模型，并有独立的 TTS 与 STT 服务商页面。

::: info 为什么选择小米 MiMo？
如果你希望在同一 MiMo 账户下使用聊天和音频能力，可以选择它。
:::

## 第一步：获取 API Key

1. 打开并登录 [小米 MiMo 平台](https://platform.xiaomimimo.com/)，创建 API Key。

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Xiaomi MiMo**，填写 **API Key**。默认 Base URL 为 `https://api.xiaomimimo.com/v1/`。
2. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
3. **选择模型**：测试成功后，选择模型，再到 **设置 → 意识** 启用。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::
