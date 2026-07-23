---
title: 浏览器 Web Speech API（ASR/STT）
description: 在 AIRI 网页版中使用浏览器内置语音识别
---

Web Speech API 使用浏览器提供的语音识别能力，不需要单独申请 API Key。

::: info 为什么选择 Web Speech API？
如果你只在网页版快速试用语音输入，并且浏览器支持 Web Speech API，这是最少配置的选择。
:::

## 第一步：确认浏览器支持

1. 使用 AIRI 网页版；Web Speech API 不会在桌面版（Electron）中提供。
2. 确认当前浏览器支持 Web Speech API，并准备允许麦克风权限。

::: warning 浏览器限制
Web Speech API 仅适用于浏览器环境，AIRI 桌面版（Electron）不支持它。不同浏览器、网络环境和语言的识别能力可能不同。
:::

## 第二步：在 AIRI 中配置

1. 在网页版打开 **设置 → 服务商 → 语音识别 → Web Speech API**。
2. 选择识别语言，以及需要时的连续识别和中间结果选项。

## 第三步：验证配置

1. 前往 **设置 → 听觉** 选择 Web Speech API 和音频输入设备。
2. 允许浏览器访问麦克风，开始一次短语音输入测试。
3. 转写文字能显示即表示配置成功。

## 排查

没有文字结果时，检查浏览器麦克风权限、所选输入设备和识别语言。若浏览器不支持该 API，请改用本地或云端 ASR。
