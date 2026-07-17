---
title: 配置视觉
description: 为 AIRI 的视觉模块选择图像理解服务商和模型
---

视觉模块会把捕获的画面发送给支持图像输入的模型，用于理解屏幕或摄像头画面。AIRI 不维护一套独立的视觉 API 凭据：它会为每个聊天服务商提供对应的视觉配置项，并复用该服务商的字段。

::: info 为什么视觉配置与聊天配置共用？
同一服务商通常同时提供聊天和图像理解模型。复用凭据可减少重复配置；你仍需选择一个明确支持图像输入的模型，纯文本模型无法完成视觉任务。
:::

## 第一步：选择视觉服务商

1. 打开 **设置 → 服务商 → 视觉**。
2. 选择一个你已经配置过或准备配置的聊天服务商。
3. 按该服务商卡片填写凭据。字段与其聊天服务商版本一致，例如 API Key、Base URL、Azure 资源信息或 Amazon Bedrock Region。

可用的视觉服务商来自当前聊天服务商注册表。下面每一项都会在 **设置 → 服务商 → 视觉** 中出现相同服务商的配置卡片；凭据与对应聊天页相同。

## 服务商与对应聊天配置

| 视觉服务商 | 对应聊天配置 |
| --- | --- |
| AIRI 官方提供商 | [AIRI 官方提供商](./providers/consciousness/official.md) |
| 302.AI | [302.AI](./providers/consciousness/302ai.md) |
| AIHubMix | [AIHubMix](./providers/consciousness/aihubmix.md) |
| Amazon Bedrock | [Amazon Bedrock](./providers/consciousness/amazon-bedrock.md) |
| Anthropic | [Anthropic](./providers/consciousness/anthropic.md) |
| Azure AI Foundry | [Azure AI Foundry](./providers/consciousness/azure-ai-foundry.md) |
| Azure OpenAI | [Azure OpenAI](./providers/consciousness/azure-openai.md) |
| BytePlus | [BytePlus](./providers/consciousness/byteplus.md) |
| BytePlus Coding Plan | [BytePlus Coding Plan](./providers/consciousness/byteplus-coding-plan.md) |
| Cerebras | [Cerebras](./providers/consciousness/cerebras.md) |
| Cloudflare Workers AI | [Cloudflare Workers AI](./providers/consciousness/cloudflare-workers-ai.md) |
| CometAPI | [CometAPI](./providers/consciousness/comet-api.md) |
| DeepSeek | [DeepSeek](./providers/consciousness/deepseek.md) |
| Featherless.ai | [Featherless.ai](./providers/consciousness/featherless.md) |
| Fireworks AI | [Fireworks AI](./providers/consciousness/fireworks.md) |
| Google Gemini | [Google Gemini](./providers/consciousness/google-gemini.md) |
| Groq | [Groq](./providers/consciousness/groq.md) |
| LM Studio | [LM Studio](./providers/consciousness/lm-studio.md) |
| MiniMax | [MiniMax](./providers/consciousness/minimax.md) |
| MiniMax Global | [MiniMax Global](./providers/consciousness/minimax-global.md) |
| Mistral | [Mistral](./providers/consciousness/mistral.md) |
| ModelScope | [ModelScope](./providers/consciousness/modelscope.md) |
| Moonshot | [月之暗面](./providers/consciousness/moonshot.md) |
| 小米 MiMo | [小米 MiMo](./providers/consciousness/mimo.md) |
| n1n | [n1n](./providers/consciousness/n1n.md) |
| NVIDIA NIM | [NVIDIA NIM](./providers/consciousness/nvidia.md) |
| Novita | [Novita](./providers/consciousness/novita.md) |
| Ollama | [Ollama](./providers/consciousness/ollama.md) |
| OpenAI 与兼容 API | [OpenAI 与兼容 API](./providers/consciousness/openai.md) |
| OpenRouter | [OpenRouter](./providers/consciousness/openrouter.md) |
| Perplexity | [Perplexity](./providers/consciousness/perplexity.md) |
| Together.ai | [Together.ai](./providers/consciousness/together.md) |
| xAI | [xAI](./providers/consciousness/xai.md) |
| Z.ai | [Z.ai](./providers/consciousness/zhipu.md) |
| 火山引擎 Coding Plan | [火山引擎 Coding Plan](./providers/consciousness/volcengine-coding-plan.md) |

这表示 AIRI 有该服务商的视觉配置入口，并不表示该服务商的每一个模型都能读图。仍须在模型列表中选择明确支持图片输入的模型。

::: warning 图像与凭据安全
视觉分析会把画面发送给所选服务商。不要捕获包含 API Key、密码、个人信息或未经授权内容的画面；云端服务的凭据也不得提交到仓库、截图或发送给他人。
:::

## 第二步：选择视觉模型

1. 打开 **设置 → 视觉**。
2. 选择刚配置的服务商。
3. 从模型列表选择支持图片或视觉输入的模型。
4. 启用需要的视觉功能，并按页面提示选择画面来源或捕获方式。

## 第三步：配置校验

1. 使用一张不含敏感信息的测试画面。
2. 触发一次视觉分析。
3. 当 AIRI 返回画面描述或相应上下文时，说明服务商、模型与画面输入已配置成功。

## 本地视觉模型

Ollama 与 LM Studio 可作为本地视觉服务商。先在本地运行一个支持图像输入的模型，并确认其服务地址可被 AIRI 访问；随后在视觉服务商页填写或保留相应 Base URL，并从模型列表选择该视觉模型。

## 排查

| 现象 | 优先检查 |
| --- | --- |
| 服务商无法保存 | 与聊天版本相同的凭据字段是否完整，例如 API Key、Azure 资源名称或 Bedrock Region。 |
| 模型无法分析图片 | 该模型是否明确支持图像输入；切换到服务商提供的视觉模型。 |
| 本地模型不可达 | 本地服务是否运行、Base URL、端口、CORS 与局域网访问设置。 |
| 请求被拒绝或额度不足 | 服务商账户权限、模型可用地区、额度和网络连接。 |
