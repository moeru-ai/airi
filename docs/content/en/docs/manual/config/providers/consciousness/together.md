---
title: Together AI
description: Configuring Together AI as a large model service provider in AIRI
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
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Together AI console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Together AI**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.together.xyz/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, the exact model ID provided by Together AI can be manually entered on the Consciousness page.
