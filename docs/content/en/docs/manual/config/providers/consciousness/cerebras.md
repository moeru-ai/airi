---
title: Cerebras
description: Configuring the Cerebras chat model in AIRI
---

Cerebras provides a chat model in AIRI through its compatible API.

::: info Why Cerebras?
You can select this if you are already using the Cerebras API and want to call the account-available model in AIRI.
:::

## Step 1: Obtain API Key

1. Open and log in to [Cerebras Cloud](https://cloud.cerebras.ai/), then create an API key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Cerebras** and fill in the **API Key**. The default Base URL is `https://api.cerebras.ai/v1/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by Cerebras on the Consciousness page.
