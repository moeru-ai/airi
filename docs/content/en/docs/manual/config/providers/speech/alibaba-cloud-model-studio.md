---
title: Alibaba Cloud Bailian (TTS)
description: Configuring Alibaba Cloud Bailian speech synthesis in AIRI
---

Alibaba Cloud Bailian provides the CosyVoice speech synthesis model in AIRI.

::: info Why choose Alibaba Cloud Bailian?
If you are already using Alibaba Cloud Bailian and want to choose among CosyVoice sounds and models, this is the direct access method.
:::

## Step 1: Obtain API Key

1. Open and log in to [Alibaba Cloud Bailian Console](https://bailian.console.aliyun.com/), then confirm that the model service is enabled.
2. Create a key on the API Key management page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit Bailian API Key to the warehouse, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Alibaba Cloud Model Studio**.
2. Paste the Bailian API Key into the basic settings; the Base URL uses the interface default value unless you configure a compatible gateway.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model and tone**: After the test is successful, select the CosyVoice model and tone, and then go to **Settings → Voice** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When pinging the API fails, check the API Key, account limit, and network connection. When the model or sound is not available for selection, make sure that the corresponding model has been opened in the Bailian account.
