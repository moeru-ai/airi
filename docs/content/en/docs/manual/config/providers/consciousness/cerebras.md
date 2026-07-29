---
title: Cerebras
description: Configuring the Cerebras chat model in AIRI
---

Cerebras provides a chat model in AIRI through its compatible API.

::: info Why Cerebras?
You can select this if you are already using the Cerebras API and want to call the account-available model in AIRI.
:::

## Obtain API Key

Log in to [Cerebras Cloud](https://cloud.cerebras.ai/), then create an API key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

Open **Settings → Providers → Chat → Cerebras** and fill in the **API Key**. The default Base URL is `https://api.cerebras.ai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by Cerebras on the Consciousness page.
