---
title: Index-TTS (local TTS)
description: Connecting to the local Index-TTS service in AIRI
---

Index-TTS connects to AIRI through a local HTTP service.

::: info Why choose Index-TTS?
You can select this if you are already running Index-TTS locally and want the sound data to remain on the local network.
:::

## Start local service

1. Follow the deployment instructions for Index-TTS to start the service.
2. AIRI connects to `http://localhost:11996/tts/` by default; if you use other hosts or ports, please record the complete address.
3. Confirm that the service can return model and voice information.

::: warning Local service security
Do not expose local service ports to untrusted public networks. If you modify the listening address, please confirm that you are responsible for access control.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Bilibili / IndexTTS**.
2. Fill in the Base URL consistent with the local service.

## Verify configuration

1. Select an available voice in the provider playground. This page uses the configured Index-TTS service and AIRI's default model ID.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Bilibili / IndexTTS**, choose model ID `IndexTTS-1.5`, and select a voice. The provider test alone does not enable speech for normal replies.

## Troubleshooting

When unable to connect, verify that the service is running, that the Base URL contains the correct port, and check the local firewall or reverse proxy. When the voice list is empty, check whether the `audio/voices` interface of the service is available.
