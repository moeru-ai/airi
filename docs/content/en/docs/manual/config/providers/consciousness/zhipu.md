---
title: Wisdom spectrum AI
description: Configure Intelligent Spectrum AI as a large model service provider in AIRI
is_openai_compatible: true
---

Zhipu AI provides a chat API compatible with OpenAI format. After completing the configuration on this page, AIRI can use the model provided by Wisdom AI in "Consciousness".

::: info Why choose Zhipu AI?
If you want to use the Zhipu AI model in AIRI, or already have its API Key, you can choose this service provider directly.
:::

## Step 1: Get the API key

1. Open [Zhipu AI API Keys](https://open.bigmodel.cn/usercenter/apikeys)。
2. Create a new API Key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Zhipu AI console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Zhipu AI**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://open.bigmodel.cn/api/paas/v4/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list cannot be loaded, you can manually enter the precise model ID provided by Wisdom AI on the "Consciousness" page.
