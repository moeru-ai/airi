---
title: 小米 MiMo（ASR/STT）
description: 在 AIRI 中配置小米 MiMo 语音识别
---

MiMo 使用其原生音频理解模型完成语音转写。

::: info 为什么选择小米 MiMo？
如果你已使用 MiMo，或希望使用其多模态模型处理音频内容，可以选择该服务商。
:::

## 第一步：获取 API Key

1. 打开并登录 [小米 MiMo 平台](https://platform.xiaomimimo.com/)，确认账户已开通 API 使用权限。
2. 创建 API Key，复制后妥善保存。

::: warning API Key 与音频数据
不要公开 API Key。使用云端转写会把待识别音频发送给服务商，请先确认你的数据处理要求。
:::

## 第二步：在 AIRI 中配置

1. 在 **设置 → 服务商 → 语音识别 → Xiaomi MiMo** 中填写 API Key。
2. 保留默认 Base URL：`https://api.xiaomimimo.com/v1/`，除非服务商提供了其他地址。

## 第三步：验证配置

1. **Ping API**：点击此按钮测试网络是否连通以及 API Key 是否填写正确。
2. **选择模型**：测试成功后，选择 `mimo-v2-omni` 或界面列出的可用模型；随后到 **设置 → 听觉** 启用。
3. 允许麦克风访问并进行一段短语音输入，确认文字可输出。

## 排查

请求失败时，检查 API Key、模型选择和网络连接。没有文字结果时，确认 AIRI 已获得系统麦克风权限。
