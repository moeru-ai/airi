---
title: Novita AI
description: Configuring Novita AI as a large model service provider in AIRI
is_openai_compatible: true
---

Novita AI provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Novita AI in Consciousness.

::: info Why choose Novita AI?
If you have managed model services in Novita AI, you can directly reuse the service provider's API Key.
:::

## Step 1: Get the API key

1. Open [Novita AI Console](https://novita.ai/dashboard)。
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Novita AI console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Novita AI**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.novita.ai/openai/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, you can manually enter the exact model ID provided by Novita AI on the Consciousness page.
