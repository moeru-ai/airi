---
title: 302.AI
description: 在 AIRI 中配置 302.AI 作为大模型服务商
---

OpenRouter 跟 302.ai 一样，是一个集成式的 API 转发平台。与 302.ai 不同的是，其主要服务于国外用户，中国访问速度较慢。在 AIRI 中，它可以提供 “意识（Consciousness）” 和 “发声（Speech）”。

## 第一步：获取 302.AI 令牌

302.ai 不需要复杂的权限配置，非常适合新手。
1. 登录 [OpenRouter API Key 配置页面](https://openrouter.ai/settings/keys)。
2. 点击右上角的 "New Key"。
3. 选择一个你记得住的 API 名称（比如 "AIRI-Default"），并配置其他选项，如过期时间、总额度等。
4. 点击 **"Create"**，并点击生成的 Key 右侧的复制图标。

    ::: warning 安全提醒

    **API Key** 等同于你的账号密码。请勿在截图或直播中展示此页面，以防额度被他人盗刷。
    :::

5. **注意**：确保你的账户里有充值余额，否则 API 会报错 402/429。

## 第二步，输入 API 信息

请在 AIRI 的 **设置-> 服务来源 -> OpenRouter** 页面中按以下说明填写：

### 1. 基础设置 (Basic)
* **API Key Input**: 填入你在 302.ai 后台生成的“API 令牌”。
    * *提示：填入后点击右侧的刷新图标可以重置输入。*

### 2. 高级设置 (Advanced)
点击 **Advanced** 箭头展开隐藏选项：
* **Base URL**: `https://openrouter.ai/api/v1/`。默认情况下无需改动。

### 3. 配置校验 (Validation)
填写完成后，你会看到底部的蓝色通知栏：
1.  **Ping API**: 点击此按钮测试网络是否连通以及 API KEY 是否填写正确。
2.  **Select Model**: 网络通畅后，点击此处选择你想要使用的具体模型（如 `gpt-4o` 或 `claude-3-5-sonnet`）。
