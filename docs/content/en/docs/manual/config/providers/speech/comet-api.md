---
title: CometAPI（TTS）
description: Configuring CometAPI speech synthesis in AIRI
---

CometAPI provides speech synthesis through its compatible interface.

::: info Why choose CometAPI?
If you already use CometAPI to manage models and credentials, you can reuse the API Key directly in AIRI.
:::

## Step 1: Obtain API Key

1. Open and log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → CometAPI Speech** and fill in the API Key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; modify it only when using a proxy or compatible gateway.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Troubleshooting

When verification fails, check the API Key, account balance, and network connection. When the model list is empty, confirm that the account can currently access the voice model.
