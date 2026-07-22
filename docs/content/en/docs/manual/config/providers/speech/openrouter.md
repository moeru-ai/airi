---
title: OpenRouter（TTS）
description: Configuring OpenRouter as a speech synthesis service provider in AIRI
---

OpenRouter is an aggregation API service provider. After completing the configuration, select the voice model and timbre provided by OpenRouter in "Voice".

::: info Why choose OpenRouter Voice?
Choose this provider if you want to manage multiple models and voice capabilities within the same OpenRouter account. When using AIRI in mainland China, you can try 302.AI first; actual availability still depends on your network environment, payment method, and service provider policies.
:::

## Step 1: Obtain API Key

1. Open [OpenRouter API Keys](https://openrouter.ai/keys), then create a new API key.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the OpenRouter console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → OpenRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1/`.

## Step 3: Verify configuration

1. Select the configured service provider, model and tone in "Voice".
2. Enter a test text and click Test.
3. If the voice can be played normally, the configuration is successful; if an error is displayed, please check the credentials and model based on the error message.

## Troubleshooting

When there is no sound, confirm that the selected model provides voice output, and check the account balance and network connection.
