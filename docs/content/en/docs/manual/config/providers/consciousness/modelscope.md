---
title: ModelScope
description: Configuring the ModelScope chat model in AIRI
---

ModelScope provides chat models in AIRI through its inference API.

::: info Why choose ModelScope?
If you have managed model access in ModelScope, use this card to directly fill in the corresponding API Key.
:::

## Step 1: Obtain API Key

1. Open and log in [ModelScope](https://modelscope.cn/), then create an API key in the account console.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → ModelScope** and fill in the **API Key**. The default Base URL is `https://api-inference.modelscope.cn/v1/`.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Modules → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by ModelScope on the Consciousness page.
