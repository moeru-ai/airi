---
title: OpenAI Compatible API (TTS)
description: Configuring OpenAI or an OpenAI-compatible API as a speech synthesis provider in AIRI
---

This page configures a provider that implements the OpenAI speech API. After saving the provider, select its model and voice in **Settings → Modules → Speech**.

::: info Why use an OpenAI-compatible API for TTS?
Use this provider when your speech service explicitly supports the OpenAI speech API. An API address ending with `/v1` or a key starting with `sk-` does not by itself guarantee compatibility.
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

1. Select the configured provider, model, and voice in **Settings → Modules → Speech**.
2. Enter test text and click **Test Voice**.
3. If the test audio plays, the provider is configured correctly. If AIRI displays an error, use its message to check the credentials, model ID, and Base URL.

## Troubleshooting

If no audio plays, confirm that the selected model and voice are supported by the provider. For a compatible service, verify that it implements the OpenAI speech API.
