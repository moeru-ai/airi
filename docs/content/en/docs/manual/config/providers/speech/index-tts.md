---
title: Index-TTS (Local TTS)
description: Connect a local Index-TTS service in AIRI
---


Index-TTS is a text-to-speech option that connects to AIRI through a local HTTP service.


::: info Why choose Index-TTS?


If you already run Index-TTS on your machine and want voice data to stay within the local network, you can select it.


:::


## Step 1: Start the Local Service


1. Start the service following Index-TTS's deployment instructions.
2. AIRI connects to `http://localhost:11996/tts/` by default; if you use a different host or port, note the complete address.
3. Confirm the service can return model and voice information.


::: warning Local Service Security


Do not expose the local service port to untrusted public networks. If you change the listen address, confirm access control is your responsibility.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → Index-TTS by Bilibili**.
2. Fill in a Base URL matching the local service.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether AIRI can connect to the local service.
2. **Select Model and Voice**: after the test succeeds, select `IndexTTS-1.5` and a voice returned by the service, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If you cannot connect, confirm the service is running, the Base URL contains the correct port, and check the local firewall or reverse proxy. If the voice list is empty, check whether the service's `audio/voices` endpoint is available.

