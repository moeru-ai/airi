---
title: Xiaomi MiMo
description: Configure Xiaomi MiMo chat model in AIRI
---

Xiaomi MiMo provides a chat model in AIRI and has independent TTS and STT service provider pages.

::: info Why choose Xiaomi MiMo?
You can select this if you want to use chat and audio capabilities under the same MiMo account.
:::

## Obtain API Key

1. Log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/), then create an API key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Xiaomi MiMo** and fill in the **API Key**. The default Base URL is `https://api.xiaomimimo.com/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When pinging the API fails, check the API Key, account status, and network connection. When the model list fails to load, confirm that the Base URL remains as default, or enter the exact model ID provided by Xiaomi MiMo on the Consciousness page.
