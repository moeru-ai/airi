---
title: Z.ai
description: Configure Z.ai as a chat service provider in AIRI
is_openai_compatible: true
---

Z.ai provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use Z.ai models in **Consciousness**.

::: info Why choose Z.ai?
If you want to use Z.ai models in AIRI, or already have a Z.ai API key, you can choose this service provider directly.
:::

## Step 1: Get the API key

1. Open the [Z.ai API Keys page](https://z.ai/manage-apikey/apikey-list).
2. Create a new API Key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Z.ai console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Z.ai**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.z.ai/api/paas/v4`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list cannot be loaded, you can manually enter the exact model ID provided by Z.ai on the **Consciousness** page.
