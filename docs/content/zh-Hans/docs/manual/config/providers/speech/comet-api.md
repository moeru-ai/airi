---
title: CometAPI（TTS）
description: 在 AIRI 中配置 CometAPI 语音合成
---

CometAPI 通过其兼容接口提供语音合成。

::: info 为什么选择 CometAPI？
如果你已使用 CometAPI 管理模型和凭据，可直接在 AIRI 中复用该 API Key。
:::

## 第一步：获取 API Key

1. 打开并登录 [CometAPI 控制台](https://www.cometapi.com/console/token)，创建 API Key。
2. 复制密钥并妥善保存。

::: warning API Key 安全
不要将 API Key 提交到仓库、截图或发送给他人。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音合成 → CometAPI Speech**，填写 API Key。
2. 保留默认 Base URL：`https://api.cometapi.com/v1/`；只有使用代理或兼容网关时才修改。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择可用模型与音色，再到 **设置 → 发声** 启用。
3. 输入短文本试听，确认可正常播放。

## 排查

验证失败时，检查 API Key、账户余额和网络连接。模型列表为空时，确认该账户当前可访问语音模型。
