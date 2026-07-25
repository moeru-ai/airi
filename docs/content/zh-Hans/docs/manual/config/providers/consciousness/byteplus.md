---
title: BytePlus
description: 在 AIRI 中配置 BytePlus 聊天模型
---

BytePlus 在 AIRI 中使用 Ark 兼容的聊天服务配置。

::: info 为什么选择 BytePlus？
如果你已在 BytePlus 创建 Ark 模型端点，可在 AIRI 中直接使用该端点和凭据。
:::

## 第一步：准备 BytePlus 凭据

1. 打开并登录 [BytePlus Console](https://console.byteplus.com/)，创建或查看 Ark 端点及其访问凭据。

::: warning API Key 安全
不要将 API Key 或端点凭据提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → BytePlus**，按照 BytePlus 控制台填写 API Key、端点或模型信息。
2. 不要猜测 Endpoint ID；请复制控制台中已创建端点的实际标识。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络与凭据是否正确。
2. **选择模型**：测试成功后，到 **设置 → 意识** 选择该服务商与模型。

## 排查

验证失败时，检查 API Key、Endpoint ID 与模型信息是否来自同一 BytePlus Ark 项目。不要手动猜测 Endpoint ID；请从控制台复制实际标识。
