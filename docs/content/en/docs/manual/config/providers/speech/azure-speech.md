---
title: Microsoft Azure Speech (TTS)
description: Configure Microsoft Azure Speech synthesis in AIRI
---

Microsoft Azure Speech provides Azure speech synthesis capabilities in AIRI.

::: info Why choose Microsoft Azure Speech?
If your team already manages voice resources and region configurations in Azure, it's more convenient to use the same credentials.
:::

## Prepare Azure Speech resources

1. Log in to the [Azure Portal](https://portal.azure.com/), then create or open a Speech resource.
2. Record the **API Key** and region of the resource; both must come from the same Speech resource.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Azure keys provide access to your Speech resource. Do not commit a key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Microsoft / Azure Speech**.
2. Enter the API key and region. The default Base URL is the AIRI/UnSpeech gateway at `https://unspeech.hyp3r.link/v1/`, not Azure's direct API. Your key, region, text to synthesize, voice selection, and returned audio pass through this gateway. Use it only if you accept that trust boundary; otherwise enter a compatible self-hosted gateway URL or choose a direct provider.

## Verify configuration

1. Select an available voice in the provider playground. This page uses AIRI's default Azure Speech model.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Microsoft / Azure Speech**, then select an available model and voice. The provider playground tests credentials; this module selection enables speech for normal AIRI replies.

## Troubleshooting

If verification fails, first confirm that the region matches the Speech resource. If there is no sound, confirm that a voice is selected under **Settings → Modules → Speech** and that the resource has available quota.
