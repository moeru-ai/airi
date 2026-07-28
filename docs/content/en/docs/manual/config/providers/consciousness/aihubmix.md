---
title: AIHubMix
description: Configuring the AIHubMix chat model in AIRI
---

AIHubMix provides chat models in AIRI and lists available models for an account.

::: info Why choose AIHubMix?
You can select this if you wish to use the models provided in your AIHubMix account via an API Key.
:::

## Step 1: Obtain API Key

1. Open and sign in to [AIHubMix](https://aihubmix.com/), then create an API key in the console.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → AIHubMix** and fill in the **API Key**. The default Base URL is `https://aihubmix.com/v1/`.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select Model**: After successful testing, select the specific model you want to use; then go to **Settings → Modules → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account balance, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by AIHubMix on the Consciousness page.
