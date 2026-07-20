---
title: 小米 MiMo（TTS）
description: 在 AIRI 中配置小米 MiMo 语音合成
---

MiMo 支持预设音色、声音设计和声音克隆三种语音合成模式。

::: info 为什么选择小米 MiMo？
如果你需要预设中文音色，或希望使用文字描述设计声音，可以选择 MiMo。
:::

## 第一步：获取 API Key

1. 打开并登录 [小米 MiMo 平台](https://platform.xiaomimimo.com/)，确认账户已开通 API 使用权限。
2. 创建 API Key，复制后妥善保存。

::: warning 声音样本与 API Key 安全
声音克隆需要 Base64 data URI 格式的音频样本。只能上传你有权使用的声音；不要公开 API Key 或他人的声音样本。
:::

## 第二步：在 AIRI 中配置

1. 在 **设置 → 服务商 → 语音合成 → Xiaomi MiMo** 中填写 API Key。
2. 保留默认 Base URL：`https://api.xiaomimimo.com/v1/`，除非服务商提供了其他地址。

### 3. 配置校验

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型和音色**：测试成功后，选择预设音色、声音设计或声音克隆模型，并在 **设置 → 发声** 启用。
3. 输入短文本试听。声音设计需要样式描述；声音克隆还需要合法的声音样本。

## 排查

请求失败时，检查 API Key 和模型选择。声音克隆失败时，确认样本是有效的 Base64 data URI，且你有权使用该声音。
