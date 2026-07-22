---
title: Xiaomi MiMo (TTS)
description: Configuring Xiaomi MiMo speech synthesis in AIRI
---

MiMo supports three speech synthesis modes: preset timbre, sound design and sound cloning.

::: info Why choose Xiaomi MiMo?
If you need to preset Chinese sounds, or want to use text descriptions to design sounds, you can choose MiMo.
:::

## Step 1: Obtain API Key

1. Open and log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/), then confirm that the account has API access enabled.
2. Create an API Key, copy it and keep it in a safe place.

::: warning sound sample and API Key security
Sound cloning requires audio samples in Base64 data URI format. Only upload sounds that you have permission to use; do not publish API Keys or other people's sound samples.
:::

## Step 2: Configure in AIRI

1. Fill in the API Key in **Settings → Service Provider → Speech Synthesis → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the service provider provides another address.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Troubleshooting

When request fails, check API Key and model selection. When sound cloning fails, verify that the sample is a valid Base64 data URI and that you have permission to use the sound.
