---
title: Configure chat model
description: Configuring chat providers and models for AIRI
---

The chat model is the “brain” of AIRI. After completing this page, AIRI can generate a text response. You need a service provider account that supports chat functionality, or a running local model service.

## Prerequisites

* AIRI is installed and started.
* Cloud service provider: The API Key has been created and the account has been confirmed to be able to use the chat model.
* Local service: The model service has been started and the device where AIRI is located can access it.

## Steps

1. Open **Settings → Service Provider → Chat** and select the service provider you want to use.

When you are not sure which one to choose, you can first choose from the detailed guides available: [OpenRouter](./providers/consciousness/openrouter.md), [DeepSeek](./providers/consciousness/deepseek.md), [OpenAI Compatible API](./providers/consciousness/openai.md), or the local [Ollama](./providers/consciousness/ollama.md). Other chat service providers can be viewed from the sidebar "Service Provider → Chat Service Provider".

2. Fill in the API Key. If the service provider provides a dedicated API address, fill in the Base URL in the advanced settings; otherwise, keep the default value.

3. Click **Ping API** to test whether the network is connected and whether the API Key is filled in correctly.

4. After the network is open, click **Select Model**; you can also open **Settings → Awareness** and select the chat service provider and model you just configured.

AIRI will load the model list when supported by the service provider. When the list cannot be loaded, you can manually enter the precise model ID according to the official documentation of the service provider.

5. Return to the chat interface and send a short message, such as "Hello". Receiving a reply indicates that the configuration is successful.

## Troubleshooting

### Verification passed, but there is no optional model

First confirm that the service provider allows the model to be listed. Some service providers do not provide a model list, or the API Key does not have corresponding permissions; in this case, you can manually enter the model ID on the "Awareness" page. The model ID must exactly match the provider documentation.

### Verification failed or request timed out

Check API Key, Base URL, account limit and network connection. For local services, verify that the service is running and that the Base URL is not an address that only other devices are allowed to access.

### AIRI No reply

Confirm that both the service provider and the model are selected on the "Awareness" page. Simply saving the provider credentials will not automatically enable it.

## Next step

After the chat function is normal, you can continue to [Configure Voice Input and Output](./audio.md) to let AIRI speak and use the microphone for input.
