---
title: CometAPI
description: Configuring the CometAPI chat model in AIRI
---

CometAPI provides a chat model in AIRI and also has independent TTS and STT service provider pages.

::: info Why choose CometAPI?
You can select this if you wish to configure chat, speech synthesis and speech recognition under the same CometAPI account.
:::

## Step 1: Obtain API Key

1. Open and log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → CometAPI** and fill in the **API Key**. The default Base URL is `https://api.cometapi.com/v1/`.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Modules → Consciousness** to enable it.

## Troubleshooting

When provider validation fails, check the API Key, account limit and network connection. When the model list fails to load, confirm that the Base URL remains at the default value, or enter the exact model ID provided by CometAPI on the Consciousness page.
