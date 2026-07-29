---
title: Player2 Speech (TTS)
description: Connecting to local Player2 Speech service in AIRI
---

Player2 Speech is a speech synthesis option connected via a local service.

::: info Why choose Player2 Speech?
If you already run Player2 Speech locally or on a trusted LAN, you can connect AIRI to the service and use its available voices.
:::

## Start local service

1. Start the Player2 Speech service and confirm that the health check is available.
2. AIRI connects to `http://localhost:4315/v1/` by default; if the service runs at another address, please record the complete Base URL.

::: warning local service security
Do not expose local service ports to untrusted public networks.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Player2 Speech**.
2. Fill in the Base URL that is consistent with the service address.

## Verify configuration

1. Select an available voice in the provider playground. This page uses AIRI's default Player2 model.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Player2 Speech**, then choose an available model and voice. The provider test alone does not enable speech for normal replies.

## Troubleshooting

When the connection fails, check the service's `/health` response and Base URL. When the voice list is empty, confirm that the `/tts/voices` interface of the service is accessible.
