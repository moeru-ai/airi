---
title: OpenAI（和兼容 API）
description: 在 AIRI 中配置 OpenAI 和兼容 OpenAI 的 API 作为 TTS 服务商
---

不少大模型提供商都兼容 OpenAI 格式的 API。如果你发现你的模型提供商暂不受 AIRI 支持，但支持 OpenAI 格式，请按照说明配置你的 OpenAI 兼容 API TTS。

::: info 如何确定我的 TTS 提供商是否使用的是 OpenAI 兼容 API？

如果其 API 地址以 "/v1" 结尾并且 API Key 以 "sk-" 开头，则大概率这个提供商使用的是 OpenAPI 兼容 API。如果你无法找到你的 TTS 提供商，但遵循以上格式，则可以在 AIRI 中用这个提供商试试看。如果不成功，或使用其他格式，请向 GitHub 提交一个 issue，详细说明你的提供商 API 地址和所需的参数。我们会尽快接入。
:::

## 第一步：获取 API Key

1. 登录你的大模型提供商管理控制台。
2. 找到 API Key 菜单并生成你的 API Key。 API Key 应该以 "sk-" 开头。

    ::: warning 安全提醒

    **API Key** 等同于你的账号和密码。请勿告诉他人你的 API Key，以防额度被他人盗刷。
    :::

::: info
确保你的账户里有充值余额，或有开通相关自动扣费服务，否则 API 会报错。
:::


## 第二步，输入 API 信息

请在 AIRI 的 **设置-> 服务来源 -> OpenAI 兼容 API** 页面中按以下说明填写：
* *提示：点击右侧的刷新图标可以清空输入。*

### 1. 基础设置 (Basic)
* **API Key**: 填入你在大模型提供商后台生成的 API 令牌。
* **模型**：输入你想使用的 TTS 模型 ID。
* **速度**：使用滑块调整 TTS 说话的速度。

### 2. 高级设置 (Advanced)
点击 **Advanced** 箭头展开隐藏选项：
* **Base URL**: 默认值是 `https://api.openai.com/v1/`。如果你使用的是非 OpenAI 官方 API，请在这里输入你的提供商的 API 地址。地址可在提供商的开发文档中找到。

### 3. 配置校验 (Validation)
填写完成后，请按以下方法验证配置是否正确：
1. 声音 (Voice)：选择你想要的音色。
2. 使用自定义 SSML：如果你有 SSML 源码，可以打开此开关并输入 SSML 源码测试 TTS。
3. 在输入框里输入你想测试的文本。
4. 点击测试。如果你听到了声音，即测试成功。如果显示错误，请根据错误提示排查问题。
