---
title: CometAPI (TTS)
description: Configuring CometAPI speech synthesis in AIRI
---

CometAPI provides speech synthesis through its compatible interface.

::: info Why choose CometAPI?
If you already use CometAPI to manage models and credentials, you can reuse the API Key directly in AIRI.
:::

## Obtain API Key

1. Log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Comet API** and fill in the API Key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; modify it only when using a proxy or compatible gateway.

## Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Comet API**, then select an available model and voice. The playground test alone does not enable the provider for normal replies.

## Troubleshooting

When verification fails, check the API Key, account balance, and network connection. When the model list is empty, confirm that the account can currently access the voice model.
