---
title: DeepSeek
description: Configure DeepSeek as a large model service provider in AIRI
is_openai_compatible: true
---

DeepSeek provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by DeepSeek in Consciousness.

::: info Why choose DeepSeek?
If you want to use the DeepSeek model in AIRI, or already have a DeepSeek API Key, you can choose this service provider directly.
:::

## Step 1: Get the API key

1. Open [DeepSeek Management Console](https://platform.deepseek.com/)。
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the DeepSeek console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → DeepSeek**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.deepseek.com/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, you can manually enter the precise model ID provided by DeepSeek on the Consciousness page.
