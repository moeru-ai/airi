---
title: OpenAI (和兼容 API)
description: 在 AIRI 中配置 OpenAI 和兼容 OpenAI 的 API 作为大模型服务商
---

不少大模型提供商都兼容 OpenAI 格式的 API。如果你发现你的模型提供商暂不受 AIRI 支持，但支持 OpenAI 格式，请按照说明配置你的 OpenAI 兼容 API 大模型提供商。

## 第一步：获取 API Key

1. 登录你的大模型提供商管理控制台。
2. 找到 API Key 菜单并生成你的 API Key。 API Key 应该以 "sk-" 开头。

    ::: warning 安全提醒

    **API Key** 等同于你的账号密码。请勿告诉他人你的 API Key，以防额度被他人盗刷。
    :::

::: info
确保你的账户里有充值余额，或有开通相关自动扣费服务，否则 API 会报错。
:::


## 第二步，输入 API 信息

请在 AIRI 的 **设置-> 服务来源 -> OpenAI 兼容 API** 页面中按以下说明填写：

### 1. 基础设置 (Basic)
* **API Key**: 填入你在大模型提供商后台生成的 API 令牌。
    * *提示：点击右侧的刷新图标可以清空输入。*

### 2. 高级设置 (Advanced)
点击 **Advanced** 箭头展开隐藏选项：
* **Base URL**: 默认值是 `https://api.openai.com/v1/`。如果你使用的是非 OpenAI 官方 API，请在这里输入你的提供商的 API 地址。地址可在提供商的开发文档中找到。

### 3. 配置校验 (Validation)
填写完成后，你会看到底部的蓝色通知栏：
1.  **Ping API**: 点击此按钮测试网络是否连通以及 API KEY 是否填写正确。
2.  **Select Model**: 网络通畅后，点击此处选择你想要使用的具体模型（如 `gpt-4o` 或 `claude-3-5-sonnet`）。

---
::: info 如何确定我的大模型提供商是否使用的是 OpenAI 兼容 API？

如果其 API 地址以 "/v1" 结尾并且 API Key 以 "sk-" 开头，则大概率这个提供商使用的是 OpenAI 兼容 API。如果你无法找到你的大模型提供商，但其 API 地址和 API Key 遵循以上格式，则可以在 AIRI 中用这个提供商试试看。
:::
