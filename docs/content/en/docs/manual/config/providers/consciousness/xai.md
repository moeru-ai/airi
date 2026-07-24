---
title: xAI
description: Configuring the xAI Grok chat model in AIRI
---

The xAI provider lets AIRI use the Grok chat model. Its configuration method is the same as that of common API Key service providers.

::: info Why choose xAI?
If you already have an xAI API account and want to use the Grok model in AIRI, you can choose this service provider.
:::

## Step 1: Create API Key

1. Open and log in to [xAI Developer Console](https://console.x.ai/), then create an API key.
2. Confirm that the account has been activated for API usage and has available quota.
3. Copy the key.

::: warning API Key Security
Only save the API Key in your password manager or AIRI's local settings. Do not write the key into code, commit it to a repository, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → xAI**.
2. Fill in the API Key.
3. Keep the default Base URL: `https://api.x.ai/v1/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If Ping API fails, please check the API Key, account limit and network connection first. When the model list is not available, the model ID given in the xAI documentation can be manually filled in on the Consciousness page.
