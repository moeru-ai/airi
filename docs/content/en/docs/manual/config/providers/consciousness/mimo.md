---
title: Xiaomi MiMo
description: Configure Xiaomi MiMo chat model in AIRI
---

Xiaomi MiMo provides a chat model in AIRI and has independent TTS and STT service provider pages.

::: info Why choose Xiaomi MiMo?
You can select this if you want to use chat and audio capabilities under the same MiMo account.
:::

## Step 1: Obtain API Key

1. Open and log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/), then create an API key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → Xiaomi MiMo** and fill in the **API Key**. The default Base URL is `https://api.xiaomimimo.com/v1/`.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Modules → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains as default, or enter the exact model ID provided by Xiaomi MiMo on the Consciousness page.
