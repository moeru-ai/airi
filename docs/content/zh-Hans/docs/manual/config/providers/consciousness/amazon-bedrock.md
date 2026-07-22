---
title: Amazon Bedrock
description: 在 AIRI 中配置 Amazon Bedrock 聊天模型
---

Amazon Bedrock 使用 AWS 凭据和区域来访问已获授权的基础模型。

::: info 为什么选择 Amazon Bedrock？
如果你已经在 AWS 中管理模型访问权限、区域和计费，Bedrock 可沿用这一套账户管理方式。
:::

## 第一步：准备 AWS 凭据

1. 打开并登录 [AWS Management Console](https://console.aws.amazon.com/bedrock/)，创建具备 Bedrock 权限的访问凭据。

::: warning AWS 凭据安全
不要公开 AWS 访问密钥。请使用权限最小化的凭据，并在不再使用时撤销。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Amazon Bedrock**，填写 AWS **API Key**，并选择区域；默认区域为 `us-east-1`。
2. 确认该 AWS 账户已在对应区域获得目标模型的访问权限。只有在使用自定义 Bedrock Endpoint 时才填写自定义地址。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试凭据、区域和网络是否正确。
2. **选择模型**：测试成功后，选择账户已授权的模型，再到 **设置 → 意识** 启用。

## 排查

验证失败时，检查 AWS 凭据、所选区域与模型访问权限是否属于同一账户。模型无法选择时，先在 Bedrock 控制台为该区域申请并启用对应模型。
