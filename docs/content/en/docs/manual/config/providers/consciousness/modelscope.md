---
title: ModelScope
description: Configuring the ModelScope chat model in AIRI
---

ModelScope provides chat models in AIRI through its inference API.

::: info Why choose ModelScope?
If you have managed model access in ModelScope, use this card to directly fill in the corresponding API Key.
:::

## Obtain API Key

1. Log in to [ModelScope](https://modelscope.cn/), then create an API key in the account console.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → ModelScope** and fill in the **API Key**. The default Base URL is `https://api-inference.modelscope.cn/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by ModelScope on the Consciousness page.
