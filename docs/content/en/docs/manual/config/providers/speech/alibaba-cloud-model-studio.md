---
title: Alibaba Cloud Model Studio (TTS)
description: Configure Alibaba Cloud Model Studio text-to-speech in AIRI
---


Alibaba Cloud Model Studio can provide CosyVoice text-to-speech models in AIRI.


::: info Why choose Alibaba Cloud Model Studio?


If you already use Alibaba Cloud Model Studio and want to choose among CosyVoice voices and models, this is a direct way to connect.


:::


## Step 1: Get an API Key


1. Open and sign in to the [Alibaba Cloud Model Studio console](https://bailian.console.aliyun.com/) and confirm model services are enabled.
2. Create a key on the API key management page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the Model Studio API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → Alibaba Cloud Model Studio**.
2. Paste the Model Studio API key into the basic settings; use the default Base URL unless you have configured a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, choose a CosyVoice model and voice, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If a model or voice cannot be selected, confirm the corresponding model is enabled on the Model Studio account.

