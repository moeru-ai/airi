---
title: Mistral
description: Configure Mistral as a chat provider in AIRI
is_openai_compatible: true
---

Mistral provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Mistral in Consciousness.

::: info Why choose Mistral?
If you already use Mistral models, or want to try their multilingual models in AIRI, you can choose this provider.
:::

## Get the API key

1. Open [Mistral Console](https://console.mistral.ai/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Mistral console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Mistral**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.mistral.ai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, the exact model ID provided by Mistral can be manually entered on the Consciousness page.
