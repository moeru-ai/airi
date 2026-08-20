---
title: CometAPI
description: Configuring the CometAPI chat model in AIRI
---

CometAPI provides a chat model in AIRI and also has independent TTS and STT service provider pages.

::: info Why choose CometAPI?
You can select this if you wish to configure chat, speech synthesis and speech recognition under the same CometAPI account.
:::

## Obtain API Key

1. Log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Comet API** and fill in the **API Key**. The default Base URL is `https://api.cometapi.com/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

When provider validation fails, check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by CometAPI on the Consciousness page.
