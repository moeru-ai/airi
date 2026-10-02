---
title: xAI
description: Configuring the xAI Grok chat model in AIRI
---

The xAI provider lets AIRI use the Grok chat model. Its configuration method is the same as that of common API Key service providers.

::: info Why choose xAI?
If you already have an xAI API account and want to use the Grok model in AIRI, you can choose this service provider.
:::

## Create API Key

1. Log in to [xAI Developer Console](https://console.x.ai/), then create an API key.
2. Confirm that the account has been activated for API usage and has available quota.
3. Copy the key.

::: warning API Key Security
Only save the API Key in your password manager or AIRI's local settings. Do not write the key into code, commit it to a repository, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → xAI**.
2. Fill in the API Key.
3. Keep the default Base URL: `https://api.x.ai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If provider validation fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID from the xAI documentation manually on the **Consciousness** page.
