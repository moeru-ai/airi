---
title: Together.ai
description: Configure Together.ai as a chat provider in AIRI
is_openai_compatible: true
---

Together AI provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Together AI in Consciousness.

::: info Why choose Together AI?
If you have deployed or used the model in Together AI, you can directly reuse the corresponding API Key.
:::

## Get the API key

1. Open [Together AI API Keys](https://api.together.ai/settings/api-keys).
2. Create a new API Key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Together AI console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Together.ai**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.together.xyz/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by Together AI manually on the **Consciousness** page.
