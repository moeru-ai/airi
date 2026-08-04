---
title: Player2 Speech (TTS)
description: Connect a local Player2 Speech service in AIRI
---


Player2 Speech is a text-to-speech option connected through a local service.


::: info Why choose Player2 Speech?


If you already run Player2 Speech on your machine or a trusted LAN, you can connect AIRI to that service and use the voices it provides.


:::


## Step 1: Start the Local Service


1. Start the Player2 Speech service and confirm its health check is available.
2. AIRI connects to `http://localhost:4315/v1/` by default; if the service runs at another address, note the complete Base URL.


::: warning Local Service Security


Do not expose the local service port to untrusted public networks.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → Player2 Speech**.
2. Fill in a Base URL matching the service address.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether AIRI can connect to the service.
2. **Select Model and Voice**: after the test succeeds, select `player2-tts` and a voice returned by the service, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If the connection fails, check the service's `/health` response and the Base URL. If the voice list is empty, confirm the service's `/tts/voices` endpoint is accessible.

