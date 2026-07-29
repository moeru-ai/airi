---
title: Atlas Cloud
description: Configure Atlas Cloud as a chat provider in AIRI
is_openai_compatible: true
---

Atlas Cloud provides a chat API compatible with the OpenAI format. After completing the configuration, select an Atlas Cloud model under **Settings → Modules → Consciousness**.

::: info Why choose Atlas Cloud?
If you already have an Atlas Cloud API Key, or want to use the models it provides, you can choose this service provider directly.
:::

## Get the API key

1. Go to [Atlas Cloud](https://www.atlascloud.ai/) to register an account and create an API Key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Atlas Cloud console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Atlas Cloud**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.atlascloud.ai/v1`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, you can manually enter the precise model ID provided by Atlas Cloud on the Consciousness page.
