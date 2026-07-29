---
title: DeepSeek
description: Configure DeepSeek as a large model service provider in AIRI
is_openai_compatible: true
---

DeepSeek provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by DeepSeek in Consciousness.

::: info Why choose DeepSeek?
If you want to use the DeepSeek model in AIRI, or already have a DeepSeek API Key, you can choose this service provider directly.
:::

## Get the API key

1. Open [DeepSeek Management Console](https://platform.deepseek.com/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the DeepSeek console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → DeepSeek**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.deepseek.com/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, you can manually enter the precise model ID provided by DeepSeek on the Consciousness page.
