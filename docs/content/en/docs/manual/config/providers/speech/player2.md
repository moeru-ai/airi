---
title: Player2 Speech（TTS）
description: Connecting to local Player2 Speech service in AIRI
---

Player2 Speech is a speech synthesis option connected via a local service.

::: info Why choose Player2 Speech?
If you're already running Player2 Speech locally or on a trusted LAN, you can connect AIRI to the service and read the sounds it offers.
:::

## Step one: Start local service

1. Start the Player2 Speech service and confirm that the health check is available.
2. AIRI connects to `http://localhost:4315/v1/` by default; if the service runs at another address, please record the complete Base URL.

::: warning local service security
Do not expose local service ports to untrusted public networks.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Player2 Speech**.
2. Fill in the Base URL that is consistent with the service address.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether AIRI can connect to the service.
2. **Select model and sound**: After the test is successful, select `player2-tts` and the sound returned by the service, and then go to **Settings → Sound** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When the connection fails, check the service's `/health` response and Base URL. When the tone list is empty, confirm that the `/tts/voices` interface of the service is accessible.
