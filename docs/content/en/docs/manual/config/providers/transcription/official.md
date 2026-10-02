---
title: Official Transcription Provider (ASR/STT)
description: Use official real-time speech recognition in AIRI
---

Official transcription uses your current AIRI session; no third-party API Key is required.

::: info Why choose AIRI official speech recognition?
If you already use the official AIRI provider and want to quickly enable real-time voice input, you can try this option first.
:::

## Log in to your account

1. Sign in with an AIRI account.
2. Confirm that the official transcription provider is available for the current session.

::: warning Account and audio data
Real-time recognition will send the audio to the official service. Don't use test audio that contains sensitive information, and don't share account session information.
:::

## Configure in AIRI

1. Open **Settings → Providers → Transcription → Official Transcription Provider**.
2. Confirm that the provider page is available for the signed-in account. This page does not contain the active model selector.
3. Open **Settings → Modules → Hearing**, select **Official Transcription Provider**, and select **Auto**. The current provider exposes only the `Auto` model.

## Verify configuration

1. Allow AIRI to use the microphone and perform a short voice input.
2. If the transcription appears, the provider is configured correctly.

## Troubleshooting

If the model is unavailable, confirm that you are signed in, AIRI can reach the service, and the account has available credit. If no transcription appears, check the operating system's microphone permission for AIRI.
