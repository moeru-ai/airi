---
title: Configure a Chat Model
description: Configure a chat provider and model for AIRI
---


The chat model is AIRI's "brain". After completing this page, AIRI can generate text replies. You need a provider account that supports chat functionality, or a local model service that is already running.


## Prerequisites


* AIRI is installed and running.
* Cloud provider: an API key has been created, and the account is confirmed to be able to use chat models.
* Local service: the model service is running and reachable from the device running AIRI.


## Steps


1. Open **Settings → Providers → Chat** and select the provider you want to use.


   If you are not sure which to choose, start with one of the existing detailed guides: [OpenRouter](./providers/consciousness/openrouter.md), [DeepSeek](./providers/consciousness/deepseek.md), [OpenAI-compatible API](./providers/consciousness/openai.md), or local [Ollama](./providers/consciousness/ollama.md). Other chat providers can be found by expanding "Providers → Chat Providers" in the sidebar.


2. Fill in the API key. If the provider offers a dedicated API address, fill in the Base URL in the advanced settings; otherwise keep the default.
3. Click **Ping API** to test network connectivity and whether the API key is correct.
4. Once the network works, click **Select Model**; you can also open **Settings → Consciousness** and select the chat provider and model you just configured.


   AIRI loads the model list when the provider supports it. If the list cannot be loaded, enter the exact model ID manually according to the provider's official documentation.


5. Return to the chat interface and send a short message, e.g. "Hello". If you receive a reply, the configuration was successful.


## Troubleshooting


### Verification passes, but no model is available


First confirm that the provider allows listing models. Some providers do not offer a model list, or the API key does not have the corresponding permission; in that case, enter the model ID manually on the "Consciousness" page. The model ID must match the provider documentation exactly.


### Verification fails or the request times out


Check the API key, Base URL, account credits, and network connection. For local services, confirm the service is running and that the Base URL is not an address that only allows access from other devices.


### AIRI does not reply


Confirm that both the provider and the model are selected on the "Consciousness" page. Merely saving the provider credentials does not automatically enable it.


## Next Steps


Once chat works, you can continue with [Configure Voice Input and Output](./audio.md) so AIRI can speak and use microphone input.

