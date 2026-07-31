---
title: OpenAI Compatible API (TTS)
description: Configuring OpenAI or an OpenAI-compatible API as a speech synthesis provider in AIRI
---

This page is used to configure OpenAI or a service provider that provides an OpenAI-compatible voice interface. After completing the configuration, select the model and voice in **Settings → Modules → Speech**.

::: info Why use an OpenAI-compatible API for TTS?
If your voice service provider explicitly provides an OpenAI-compatible speech synthesis interface, you can use the same configuration method to access AIRI. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Obtain API Key

1. Log in to the management console of the selected service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → OpenAI Compatible**.
2. Fill in the API Key and the TTS model ID to be used.
3. For official OpenAI, select the separate **OpenAI** provider. The **OpenAI Compatible** provider has no default Base URL; enter the complete API root documented by the compatible service.
4. Adjust the speaking speed as needed.

## Verify configuration

1. Select the configured service provider, model, and voice in **Settings → Modules → Speech**.
2. Enter test text and click **Test Voice**.
3. If the test audio plays, the provider is configured correctly. If AIRI displays an error, use its message to check the credentials, model ID, and Base URL.

## Troubleshooting

When there is no sound, first make sure you have selected a model and voice supported by the service provider. When using a compatible service, confirm that it explicitly supports the OpenAI speech synthesis interface.
