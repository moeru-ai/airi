---
title: Configure chat model
description: Configuring chat providers and models for AIRI
---

The chat model is AIRI's “brain.” To generate text replies, AIRI needs either a provider account with chat-model access or a running local model service.

## Prerequisites

- AIRI is installed and running.
- For a cloud provider, you have created an API key and confirmed that the account can use the selected chat model.
- For a local provider, its model service is running and reachable from the device running AIRI.

## Configure a provider and model

1. Open **Settings → Providers → Chat** and select the provider you want to use.

When you are not sure which one to choose, start with [OpenRouter](./providers/consciousness/openrouter.md), [DeepSeek](./providers/consciousness/deepseek.md), [OpenAI Compatible](./providers/consciousness/openai.md), or local [Ollama](./providers/consciousness/ollama.md). Other chat providers are listed under **Providers → Chat**.

2. Enter the API Key. Change the Base URL in advanced settings only when the provider's documentation requires another address.

3. Review the automatic validation result shown on the provider page. Provider fields are saved as you edit them; validation differs by provider and may check only fields, fetch the model list, or offer **Ping API** for a small live request.

4. Open **Settings → Modules → Consciousness** and select the provider and model you configured.

AIRI loads the model list when the provider supports it. If the list cannot be loaded and the field accepts custom input, enter the exact model ID from the provider's official documentation.

5. Return to the chat interface and send a short message, such as “Hello.” A reply confirms that the provider and model are working.

## Troubleshooting

### Validation passes, but no model is available

First confirm that the provider supports listing models. Some providers do not return a model list, or the API key lacks the required permission. In that case, manually enter the model ID under **Settings → Modules → Consciousness**. The model ID must exactly match the provider documentation.

### Verification failed or request timed out

Check the API Key, Base URL, account quota, and network connection. For a local service, verify that it is running and that AIRI can reach the configured address.

### AIRI does not reply

Confirm that both the provider and model are selected under **Settings → Modules → Consciousness**. Saving provider credentials does not enable the provider automatically.

## Next step

After chat works, continue to [Configure voice input and output](./audio.md) to let AIRI speak or use microphone input.
