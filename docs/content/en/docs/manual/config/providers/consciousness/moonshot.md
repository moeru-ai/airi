---
title: Moonshot AI
description: Configure Moonshot AI as a chat provider in AIRI
is_openai_compatible: true
---

Moonshot AI provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use Moonshot AI models in Consciousness.

::: info Why choose Moonshot?
If you want to use the Moonshot model in AIRI, or already have a Moonshot API Key, you can choose this service provider directly.
:::

## Get the API key

1. Open the [Moonshot Global Console](https://platform.moonshot.ai/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Moonshot console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Moonshot AI**.
2. Paste the API Key into the basic settings.
3. Keep the global Base URL `https://api.moonshot.ai/v1/`. A key from `platform.moonshot.cn` must instead use the China endpoint documented by that console; credentials and endpoints cannot be mixed between regions.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by Moonshot manually on the **Consciousness** page.
