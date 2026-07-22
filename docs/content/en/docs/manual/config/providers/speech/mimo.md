---
title: Xiaomi MiMo (TTS)
description: Configuring Xiaomi MiMo speech synthesis in AIRI
---

MiMo supports three speech synthesis modes: preset timbre, sound design and sound cloning.

::: info Why choose Xiaomi MiMo?
If you need to preset Chinese sounds, or want to use text descriptions to design sounds, you can choose MiMo.
:::

## Step 1: Obtain API Key

1. Open and log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/)，确认账户已开通 API usage rights.
2. Create an API Key, copy it and keep it in a safe place.

::: warning sound sample and API Key security
Sound cloning requires audio samples in Base64 data URI format. Only upload sounds that you have permission to use; do not publish API Keys or other people's sound samples.
:::

## Step 2: Configure in AIRI

1. Fill in the API Key in **Settings → Service Provider → Speech Synthesis → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the service provider provides another address.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model and sound**: After successful testing, select a preset sound, sound design or sound clone model and enable it in **Settings → Sound production**.
3. Enter short text to listen. Sound design requires style descriptions; sound cloning also requires legitimate sound samples.

## Troubleshooting

When request fails, check API Key and model selection. When sound cloning fails, verify that the sample is a valid Base64 data URI and that you have permission to use the sound.
