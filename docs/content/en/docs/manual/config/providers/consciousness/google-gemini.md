---
title: Google Gemini
description: Configure Google Gemini chat models in AIRI
---


The Google Gemini provider uses the OpenAI-compatible endpoint of the Google Generative Language API. After configuration, select a Gemini model on the "Consciousness" page.


::: info Why choose Google Gemini?


If you already have a Gemini API key, or want to use Gemini models in AIRI, you can select this provider.


:::


## Step 1: Create an API Key


1. Open and sign in to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey) and create a Gemini API key.
2. Confirm the project the key belongs to has the Gemini API enabled and can use the target model.
3. Copy the API key.


::: warning API Key Security


If the key leaks, revoke it and create a new one immediately in the Google AI developer console; do not put the key in code, screenshots, or public configuration files.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Google Gemini**.
2. Fill in the API key.
3. Keep the default Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


Ping API checks the network, the model list, and a chat request. If you see permission or model-unavailable errors, first check whether the API for the key's project is enabled and available in your region. Do not rewrite the model names shown in Google AI Studio into other formats; prefer selecting from the model list in AIRI.

