---
title: Featherless.ai
description: Configuring the Featherless.ai chat model in AIRI
---

Featherless.ai provides a chat model in AIRI via a compatible API.

::: info Why choose Featherless.ai?
If you have opened model access on Featherless.ai, you can directly use its API Key to configure AIRI.
:::

## Step 1: Obtain API Key

1. Open and log in [Featherless.ai](https://featherless.ai/)，在账户控制台创建 API Key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Featherless.ai** and fill in the **API Key**. The default Base URL is `https://api.featherless.ai/v1/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by Featherless.ai on the Consciousness page.
