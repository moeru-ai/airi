---
title: Alibaba Cloud Bailian (TTS)
description: Configuring Alibaba Cloud Bailian speech synthesis in AIRI
---

Alibaba Cloud Bailian provides the CosyVoice speech synthesis model in AIRI.

::: info Why choose Alibaba Cloud Bailian?
If you already use Alibaba Cloud Model Studio and want to choose among CosyVoice voices and models, this is the direct access method.
:::

## Obtain API Key

1. Log in to [Alibaba Cloud Bailian Console](https://bailian.console.aliyun.com/), then confirm that the model service is enabled.
2. Create a key on the API Key management page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit Bailian API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Alibaba Cloud Model Studio**.
2. Enter the Model Studio API key. The default Base URL is the AIRI/UnSpeech gateway at `https://unspeech.hyp3r.link/v1/`, not Alibaba Cloud's direct API. Your key, text to synthesize, model/voice selection, and returned audio pass through this gateway. Use it only if you accept that trust boundary; otherwise enter a compatible self-hosted gateway URL or choose a direct provider.

## Verify configuration

1. Select an available voice in the provider playground. This page uses AIRI's default CosyVoice model.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Alibaba Cloud Model Studio**, then select an available model and voice. The provider playground tests credentials; this module selection is what enables speech for normal AIRI replies.

## Troubleshooting

If the playground cannot complete a request, check the API Key, account limit, and network connection. When the model or voice is not available for selection, make sure that the corresponding model has been opened in the Bailian account.
