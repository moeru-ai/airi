---
title: 火山引擎 Coding Plan
description: 在 AIRI 中配置火山引擎 Coding Plan 聊天模型
---

火山引擎 Coding Plan 在 AIRI 中以独立服务商卡片提供。

::: info 为什么选择火山引擎 Coding Plan？
如果你的账户使用火山引擎 Coding Plan，应选择该卡片以匹配对应服务计划。
:::

## 第一步：准备 Coding Plan 凭据

1. 打开并登录[火山引擎控制台](https://console.volcengine.com/)，在 Coding Plan 对应页面取得 API Key、端点和模型信息。

::: warning API Key 安全
不要将 API Key 或端点凭据提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Volcengine Coding Plan**，按火山引擎控制台填写该计划的 API Key、端点和模型信息。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络与凭据是否正确。
2. **选择模型**：测试成功后，在 **设置 → 意识** 选择可用模型。

## 排查

验证失败时，检查 API Key、端点与模型信息是否属于同一火山引擎 Coding Plan。模型无法加载时，确认该计划已开通目标模型的访问权限。
