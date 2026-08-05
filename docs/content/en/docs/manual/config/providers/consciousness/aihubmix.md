---
title: AIHubMix
description: Configure AIHubMix chat models in AIRI
---


AIHubMix provides chat models in AIRI and can list the models available on your account.


::: info Why choose AIHubMix?


If you want to use the models available on your AIHubMix account with a single API key, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to [AIHubMix](https://aihubmix.com/) and create an API key in the console.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → AIHubMix** and fill in the **API Key**. The default Base URL is `https://aihubmix.com/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose the specific model you want to use, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account balance, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by AIHubMix on the "Consciousness" page.

