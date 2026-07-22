---
title: OpenAI Compatible API (TTS)
description: Configuring OpenAI or an OpenAI-compatible API as a speech synthesis provider in AIRI
---

This page is used to configure OpenAI or a service provider that provides an OpenAI-compatible voice interface. After completing the configuration, select the model and tone in "Voice".

::: info Why choose OpenAI compatible with TTS?
If your voice service provider explicitly provides an OpenAI-compatible speech synthesis interface, you can use the same configuration method to access AIRI. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Step 1: Obtain API Key

1. Log in to the management console of the selected service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → OpenAI Compatible API**.
2. Fill in the API Key and the TTS model ID to be used.
3. When using OpenAI official services, keep the default Base URL: `https://api.openai.com/v1/`; when using compatible services, fill in the API root address provided by the service provider's documentation.
4. Adjust the speaking speed as needed.

## Step 3: Verify configuration

1. Select the configured service provider, model and tone in "Voice".
2. Enter a test text and click Test.
3. If the voice can be played normally, the configuration is successful; if an error is displayed, please check the credentials, model ID and Base URL according to the error message.

## Troubleshooting

When there is no sound, first make sure you have selected a model and tone supported by the service provider. When using a compatible service, confirm that it explicitly supports the OpenAI speech synthesis interface.
