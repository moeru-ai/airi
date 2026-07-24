---
title: Mistral
description: Configuring Mistral as a large model service provider in AIRI
is_openai_compatible: true
---

Mistral provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Mistral in Consciousness.

::: info Why choose Mistral?
If you already use Mistral models, or want to try their multilingual models in AIRI, you can choose this provider.
:::

## Step 1: Get the API key

1. Open [Mistral Console](https://console.mistral.ai/)。
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Mistral console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Mistral**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.mistral.ai/v1`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, the exact model ID provided by Mistral can be manually entered on the Consciousness page.
