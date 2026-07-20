---
title: Replicate（艺术创作）
description: 在 AIRI 中配置 Replicate 图像生成
---

Replicate 让 AIRI 使用云端图像生成模型。完成配置后，可在 **设置 → 艺术** 选择 Replicate 作为图像生成来源。

::: info 为什么选择 Replicate？
如果你不想自行部署图像模型，并希望从 Replicate 可用模型中选择云端推理服务，可以选择它。
:::

## 第一步：获取 API Token

1. 打开并登录 [Replicate API Tokens](https://replicate.com/account/api-tokens)，创建 API Token。
2. 确认账户已配置可用的计费方式或额度。
3. 复制 Token 并妥善保存。

::: warning API Token 安全
不要将 Token 提交到仓库、放入截图或发送给他人。泄露后，请立即在 Replicate 控制台撤销并创建新 Token。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 艺术 → Replicate**。
2. 粘贴 API Token。
3. 填写默认模型 ID。AIRI 默认值为 `black-forest-labs/flux-schnell`；请以 Replicate 模型页面显示的精确 ID 为准。
4. 根据需要设置默认画面比例（默认 `16:9`）和推理步数（默认 4）。

### 3. 配置校验

1. 打开 **设置 → 艺术**，选择 **Replicate**。
2. 使用一条不含敏感信息的提示词生成图片。
3. 成功返回图片即表示 Token、模型 ID 和账户额度可用。

## 排查

认证失败时，检查 Token 是否粘贴完整。请求被拒绝或失败时，检查账户额度、模型访问权限和模型 ID。生成结果不符合预期时，先确认模型支持的比例和参数范围，再降低推理步数或更换模型。
