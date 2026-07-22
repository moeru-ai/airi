---
title: Atlas Cloud
description: Configuring Atlas Cloud as a large model service provider in AIRI
is_openai_compatible: true
---

Atlas Cloud is a chat API service provider compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the chat model provided by Atlas Cloud in "Consciousness".

::: info Why choose Atlas Cloud?
If you already have an Atlas Cloud API Key, or want to use the models it provides, you can choose this service provider directly.
:::

## Step 1: Get the API key

1. Go to [Atlas Cloud](https://api.atlascloud.ai/) to register an account and create an API Key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Atlas Cloud console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Atlas Cloud**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.atlascloud.ai/v1`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, you can manually enter the precise model ID provided by Atlas Cloud on the Consciousness page.
