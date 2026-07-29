---
title: Z.ai
description: Configure Z.ai as a chat service provider in AIRI
is_openai_compatible: true
---

Z.ai provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use Z.ai models in **Consciousness**.

::: info Why choose Z.ai?
If you want to use Z.ai models in AIRI, or already have a Z.ai API key, you can choose this service provider directly.
:::

## Get the API key

1. Open the [Z.ai API Keys page](https://z.ai/manage-apikey/apikey-list).
2. Create a new API Key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Z.ai console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Z.ai**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.z.ai/api/paas/v4`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list cannot be loaded, you can manually enter the exact model ID provided by Z.ai on the **Consciousness** page.
