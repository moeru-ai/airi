---
title: 支持的服务商目录
description: 查看当前版本 AIRI 支持的聊天、视觉、语音合成与语音识别服务商
---

本页根据 AIRI 当前的服务商注册表整理。服务商会随版本变化，以 **设置 → 服务商** 页面实际显示的列表为准。先在该页面完成凭据配置，再在“意识”“发声”或“听觉”模块中选用它。

## 聊天模型

下列服务商在 AIRI 中注册为聊天服务商：

| 服务商 | 类型 | 配置说明 |
| --- | --- | --- |
| AIRI 官方提供商 | 托管 | [查看指南](./consciousness/official.md) |
| 302.AI、DeepSeek、Fireworks AI、Groq、MiniMax、Mistral、Moonshot、NVIDIA NIM、Novita、OpenRouter、Perplexity、Together.ai、Z.ai | 云端 API | 已提供各自的中文指南；从侧栏“聊天”分类进入。 |
| MiniMax Global | 云端 API | [查看指南](./consciousness/minimax-global.md) |
| OpenAI、OpenAI 兼容 API | 云端 API | [查看指南](./consciousness/openai.md) |
| Anthropic | 云端 API | [查看指南](./consciousness/anthropic.md) |
| Google Gemini | 云端 API | [查看指南](./consciousness/google-gemini.md) |
| xAI | 云端 API | [查看指南](./consciousness/xai.md) |
| Cloudflare Workers AI | 账户级云端 API | [查看指南](./consciousness/cloudflare-workers-ai.md) |
| Ollama、LM Studio | 本地服务 | [Ollama](./consciousness/ollama.md)；[LM Studio](./consciousness/lm-studio.md) |
| AIHubMix | 云端 API | [查看指南](./consciousness/aihubmix.md) |
| Amazon Bedrock | 账户级云端 API | [查看指南](./consciousness/amazon-bedrock.md) |
| Azure AI Foundry | 账户级云端 API | [查看指南](./consciousness/azure-ai-foundry.md) |
| Azure OpenAI | 账户级云端 API | [查看指南](./consciousness/azure-openai.md) |
| BytePlus | 云端 API | [查看指南](./consciousness/byteplus.md) |
| BytePlus Coding Plan | 云端 API | [查看指南](./consciousness/byteplus-coding-plan.md) |
| Cerebras | 云端 API | [查看指南](./consciousness/cerebras.md) |
| CometAPI | 云端 API | [查看指南](./consciousness/comet-api.md) |
| Featherless.ai | 云端 API | [查看指南](./consciousness/featherless.md) |
| 小米 MiMo | 云端 API | [查看指南](./consciousness/mimo.md) |
| ModelScope | 云端 API | [查看指南](./consciousness/modelscope.md) |
| n1n | 云端 API | [查看指南](./consciousness/n1n.md) |
| 火山引擎 Coding Plan | 云端 API | [查看指南](./consciousness/volcengine-coding-plan.md) |

## 语音合成（TTS）

当前注册的语音合成服务商包括云端服务、本地服务和浏览器内置能力。具体可用项目仍以 **设置 → 服务商 → 语音合成** 为准。

* [AIRI 官方语音合成](./speech/official.md)、[阿里云百炼](./speech/alibaba-cloud-model-studio.md)、[ElevenLabs](./speech/elevenlabs.md)、[Deepgram](./speech/deepgram.md)、[Microsoft Azure Speech](./speech/azure-speech.md)、[MiniMax Speech](./speech/minimax.md)、[小米 MiMo](./speech/mimo.md)、[CometAPI](./speech/comet-api.md) 和 [火山引擎](./speech/volcengine.md)。
* [Google Gemini](./speech/google-gemini.md)、[OpenAI 与兼容 API](./speech/openai.md)、[OpenRouter](./speech/openrouter.md)。
* [Index-TTS](./speech/index-tts.md)、[Kokoro](./speech/kokoro.md)、[Player2 Speech](./speech/player2.md)、[浏览器本地语音合成](./speech/browser-local.md) 和 [桌面端本地语音合成](./speech/desktop-local.md)。

## 语音识别（ASR/STT）

当前注册的语音识别服务商包括云端 API、浏览器内置识别与本地识别。具体可用项目仍以 **设置 → 服务商 → 语音识别** 为准。

* [AIRI 官方语音识别](./transcription/official.md)、[阿里云 NLS](./transcription/aliyun.md)、[CometAPI](./transcription/comet-api.md)、[小米 MiMo](./transcription/mimo.md) 与 [OpenAI 和兼容 API](./transcription/openai.md)。
* [浏览器 Web Speech API](./transcription/web-speech-api.md)、[浏览器本地语音识别](./transcription/browser-local.md) 和 [桌面端本地语音识别](./transcription/desktop-local.md)。

## 视觉理解

视觉理解服务从已配置的聊天服务商派生，不需要单独申请另一套 API Key。选择支持图像输入的模型后，即可让 AIRI 分析图片。

* [查看视觉理解配置指南](../vision.md)。

## 艺术创作

艺术模块使用所选服务商生成图片。当前注册的艺术服务商如下：

| 服务商 | 类型 | 配置说明 |
| --- | --- | --- |
| ComfyUI | 本地工作流 | [查看指南](./artistry/comfyui.md) |
| Replicate | 云端图像生成 | [查看指南](./artistry/replicate.md) |
| Nano Banana | 云端图像生成 | [查看指南](./artistry/nanobanana.md) |

## 选择建议

* 想快速开始：先选择一个已提供详细指南的聊天服务商。
* 重视隐私或离线使用：选择 Ollama 或 LM Studio，并确认本地服务已启动。
* 需要完整语音交互：在聊天正常后，再分别配置 TTS 与 ASR/STT。
