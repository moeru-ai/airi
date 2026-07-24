---
title: Google Gemini
description: Configuring the Google Gemini chat model in AIRI
---

The Google Gemini provider uses the OpenAI-compatible endpoint of the Google Generative Language API. After completing the configuration, select the Gemini model on the "Consciousness" page.

::: info Why choose Google Gemini?
If you already have a Gemini API Key or want to use Gemini models in AIRI, you can choose this service provider.
:::

## Step 1: Create API Key

1. Open and log in [Google AI Studio API Keys](https://aistudio.google.com/app/apikey), then create a Gemini API key.
2. Confirm that the project to which the key belongs has enabled the Gemini API and can use the target model.
3. Copy the API Key.

::: warning API Key Security
After the key is leaked, please immediately revoke and recreate it in the Google AI developer console; do not put the key in code, screenshots, or public configuration files.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → Google Gemini**.
2. Fill in the API Key.
3. Keep the default Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

The Ping API checks the network, model list, and chat requests. When a permission or model unavailable error occurs, please first check the API activation status and regional availability of the project corresponding to the API Key. Do not rewrite the model names displayed in Google AI Studio to other formats; in AIRI, select from the model list first.
