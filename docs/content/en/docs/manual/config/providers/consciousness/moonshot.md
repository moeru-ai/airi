---
title: Moonshot (Dark Side of the Moon)
description: Configuring Moonshot as a large model service provider in AIRI
is_openai_compatible: true
---

Moonshot provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Moonshot in Consciousness.

::: info Why choose Moonshot?
If you want to use the Moonshot model in AIRI, or already have a Moonshot API Key, you can choose this service provider directly.
:::

## Step 1: Get the API key

1. Open [Moonshot Console](https://platform.moonshot.cn/)。
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Moonshot console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Provider → Chat → Moonshot**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.moonshot.cn/v1`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, the exact model ID provided by Moonshot can be manually entered on the Consciousness page.
