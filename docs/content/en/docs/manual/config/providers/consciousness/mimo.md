---
title: Xiaomi MiMo
description: Configure Xiaomi MiMo chat models in AIRI
---


Xiaomi MiMo provides chat models in AIRI and also has dedicated TTS and STT provider pages.


::: info Why choose Xiaomi MiMo?


If you want to use chat and audio capabilities under the same MiMo account, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to the [Xiaomi MiMo platform](https://platform.xiaomimimo.com/) and create an API key.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Xiaomi MiMo** and fill in the **API Key**. The default Base URL is `https://api.xiaomimimo.com/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account status, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by Xiaomi MiMo on the "Consciousness" page.

