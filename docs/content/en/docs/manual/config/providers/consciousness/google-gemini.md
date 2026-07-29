---
title: Google Gemini
description: Configuring the Google Gemini chat model in AIRI
---

The Google Gemini provider uses the OpenAI-compatible endpoint of the Google Generative Language API. After completing the configuration, select the Gemini model under **Settings → Modules → Consciousness**.

::: info Why choose Google Gemini?
If you already have a Gemini API Key or want to use Gemini models in AIRI, you can choose this service provider.
:::

## Create API Key

1. Log in to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey), then create a Gemini API key.
2. Confirm that the project to which the key belongs has enabled the Gemini API and can use the target model.
3. Copy the API Key.

::: warning API Key Security
After the key is leaked, please immediately revoke and recreate it in the Google AI developer console; do not put the key in code, screenshots, or public configuration files.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Google Gemini**.
2. Fill in the API Key.
3. Keep the default Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

The provider validation checks the network, model list, and chat requests. When a permission or model unavailable error occurs, please first check the API activation status and regional availability of the project corresponding to the API Key. Do not rewrite the model names displayed in Google AI Studio to other formats; in AIRI, select from the model list first.
