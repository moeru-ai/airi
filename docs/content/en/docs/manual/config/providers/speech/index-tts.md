---
title: Index-TTS (local TTS)
description: Connecting to the local Index-TTS service in AIRI
---

Index-TTS is a speech synthesis option that interfaces with AIRI via a native HTTP service.

::: info Why choose Index-TTS?
You can select this if you are already running Index-TTS locally and want the sound data to remain on the local network.
:::

## Step one: Start local service

1. Follow the deployment instructions for Index-TTS to start the service.
2. AIRI connects to `http://localhost:11996/tts/` by default; if you use other hosts or ports, please record the complete address.
3. Confirm that the service can return model and timbre information.

::: warning local service security
Do not expose local service ports to untrusted public networks. If you modify the listening address, please confirm that you are responsible for access control.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Index-TTS by Bilibili**.
2. Fill in the Base URL consistent with the local service.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether AIRI can connect to the local service.
2. **Select model and tone**: After the test is successful, select `IndexTTS-1.5` and the tone returned by the service; then go to **Settings → Speech** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When unable to connect, verify that the service is running, that the Base URL contains the correct port, and check the local firewall or reverse proxy. When the tone list is empty, check whether the `audio/voices` interface of the service is available.
