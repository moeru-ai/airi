---
title: AIRI official speech recognition (ASR/STT)
description: Use official real-time speech recognition in AIRI
---

The official voice recognition will use your AIRI login status, and there is no need to fill in a third-party API Key separately.

::: info Why choose AIRI official speech recognition?
If you already use the official AIRI provider and want to quickly enable real-time voice input, you can try this option first.
:::

## Step 1: Log in to your account

1. Complete the login using an AIRI account; official real-time identification relies on the current login status.
2. There is no need to create or fill in a third-party API Key.

::: warning account and audio data
Real-time recognition will send the audio to the official service. Don't use test audio that contains sensitive information, and don't share account session information.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Voice Recognition → AIRI Official Voice Recognition**.
2. Select `Auto` or the model provided by the server, and then go to **Settings → Hearing** to enable it.

## Step 3: Verify configuration

1. Allow AIRI to use the microphone and perform a short voice input.
2. If the transcribed text can be displayed, the configuration is successful.

## Troubleshooting

When the model cannot be used, make sure the account is logged in, the network is normal, and there is available credit. When there are no text results, check the system microphone permissions.
