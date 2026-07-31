---
title: Official Transcription Provider (ASR/STT)
description: Use official real-time speech recognition in AIRI
---

The official voice recognition will use your AIRI login status, and there is no need to fill in a third-party API Key separately.

::: info Why choose AIRI official speech recognition?
If you already use the official AIRI provider and want to quickly enable real-time voice input, you can try this option first.
:::

## Log in to your account

1. Sign in with an AIRI account; official real-time transcription uses the current session.
2. There is no need to create or fill in a third-party API Key.

::: warning Account and audio data
Real-time recognition will send the audio to the official service. Don't use test audio that contains sensitive information, and don't share account session information.
:::

## Configure in AIRI

1. Open **Settings → Providers → Transcription → Official Transcription Provider**.
2. Confirm that the provider page is available for the signed-in account. This page does not contain the active model selector.
3. Open **Settings → Modules → Hearing**, select **Official Transcription Provider**, and select **Auto**. The current provider exposes only the `Auto` model.

## Verify configuration

1. Allow AIRI to use the microphone and perform a short voice input.
2. If the transcribed text can be displayed, the configuration is successful.

## Troubleshooting

When the model cannot be used, make sure the account is logged in, the network is normal, and there is available credit. When there are no text results, check the system microphone permissions.
