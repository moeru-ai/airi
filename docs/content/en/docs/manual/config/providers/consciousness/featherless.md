---
title: Featherless AI
description: Configuring the Featherless.ai chat model in AIRI
---

Featherless.ai provides a chat model in AIRI via a compatible API.

::: info Why choose Featherless.ai?
If you have opened model access on Featherless.ai, you can directly use its API Key to configure AIRI.
:::

## Obtain API Key

1. Log in to [Featherless.ai](https://featherless.ai/), then create an API key in the account console.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Featherless AI** and fill in the **API Key**. The default Base URL is `https://api.featherless.ai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by Featherless.ai on the Consciousness page.
