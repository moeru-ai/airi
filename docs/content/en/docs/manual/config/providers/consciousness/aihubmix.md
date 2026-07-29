---
title: AIHubMix
description: Configuring the AIHubMix chat model in AIRI
---

AIHubMix provides chat models in AIRI and lists available models for an account.

::: info Why choose AIHubMix?
You can select this if you wish to use the models provided in your AIHubMix account via an API Key.
:::

## Obtain API Key

Log in to [AIHubMix](https://aihubmix.com/), then create an API key in the console.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

Open **Settings → Providers → Chat → AIHubMix** and fill in the **API Key**. The default Base URL is `https://aihubmix.com/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account balance, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by AIHubMix on the Consciousness page.
