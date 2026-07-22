---
title: Xiaomi MiMo
description: Configure Xiaomi MiMo chat model in AIRI
---

Xiaomi MiMo provides a chat model in AIRI and has independent TTS and STT service provider pages.

::: info Why choose Xiaomi MiMo?
You can select this if you want to use chat and audio capabilities under the same MiMo account.
:::

## Step 1: Obtain API Key

1. Open and log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/)，创建 API Key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Xiaomi MiMo** and fill in the **API Key**. The default Base URL is `https://api.xiaomimimo.com/v1/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Consciousness** to enable it.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains as default, or enter the exact model ID provided by Xiaomi MiMo on the Consciousness page.
