---
title: OpenRouter (TTS)
description: Configuring OpenRouter as a speech synthesis service provider in AIRI
---

OpenRouter is an aggregation API service provider. After completing the configuration, select the model and voice provided by OpenRouter under **Settings → Modules → Speech**.

::: info Why choose OpenRouter Voice?
Choose this provider if you want to manage supported speech models and voices through an OpenRouter account. Availability still depends on your network environment, payment method, and OpenRouter policies.
:::

## Obtain API Key

1. Open [OpenRouter API Keys](https://openrouter.ai/keys), then create a new API key.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the OpenRouter console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → OpenRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1/`.

## Verify configuration

1. Select the configured provider, model, and voice under **Settings → Modules → Speech**.
2. Enter test text and click **Test Voice**.
3. If the test audio plays, the provider is configured correctly. If AIRI displays an error, use its message to check the credentials and model.

## Troubleshooting

When there is no sound, confirm that the selected model provides voice output, and check the account balance and network connection.
