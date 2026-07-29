---
title: Xiaomi MiMo (TTS)
description: Configuring Xiaomi MiMo speech synthesis in AIRI
---

MiMo supports three speech synthesis modes: preset voice, sound design and sound cloning.

::: info Why choose Xiaomi MiMo?
Choose MiMo if you need its preset Chinese voices or want to design voices from text descriptions.
:::

## Obtain API Key

1. Log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/), then confirm that the account has API access enabled.
2. Create an API Key, copy it and keep it in a safe place.

::: warning sound sample and API Key security
Voice cloning requires audio samples in Base64 data URI format. Upload only samples you have permission to use, and never publish API keys or another person's voice samples.
:::

## Configure in AIRI

1. Fill in the API Key in **Settings → Providers → Speech → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the service provider provides another address.

## Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Xiaomi MiMo**, choose model ID `mimo-v2-omni`, and select a voice. The provider test alone does not enable speech for normal replies.

## Troubleshooting

When request fails, check API Key and model selection. When sound cloning fails, verify that the sample is a valid Base64 data URI and that you have permission to use the sound.
