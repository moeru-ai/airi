---
title: MiniMax (Mainland China)
description: Configure the Chinese mainland version of MiniMax in AIRI as a large model service provider
is_openai_compatible: true
---

This page applies to API Keys created on the MiniMax open platform in mainland China. MiniMax provides a chat API compatible with the OpenAI format; once configured, AIRI can use its models in Consciousness.

::: info Why choose MiniMax?
If you create an API Key on the MiniMax open platform in mainland China, you should choose this service provider. Please use [MiniMax Global](./minimax-global.md) for keys created by overseas platforms.
:::

## Step 1: Get the API key

1. Open [MiniMax Console](https://platform.minimaxi.com/)。
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the MiniMax console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → MiniMax**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.minimaxi.com/v1/`. The API Key, billing and Base URL of mainland China and overseas platforms cannot be mixed.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, the exact model ID provided by MiniMax can be manually entered on the Consciousness page.
