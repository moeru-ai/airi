---
title: Cerebras
description: Configuring the Cerebras chat model in AIRI
---

Cerebras provides a chat model in AIRI through its compatible API.

::: info Why Cerebras?
Choose Cerebras if you already use its API and want to access the models available to your account from AIRI.
:::

## Obtain API Key

Log in to [Cerebras Cloud](https://cloud.cerebras.ai/), then create an API key.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

Open **Settings → Providers → Chat → Cerebras** and fill in the **API Key**. The default Base URL is `https://api.cerebras.ai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by Cerebras on the Consciousness page.
