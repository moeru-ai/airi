---
title: Groq
description: Configure Groq as a chat provider in AIRI
is_openai_compatible: true
---

Groq provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Groq in Consciousness.

::: info Why choose Groq?
If you value conversational responsiveness and the target model is available in Groq, try this provider.
:::

## Get the API key

1. Open [Groq Console](https://console.groq.com/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Groq console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Groq**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.groq.com/openai/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by Groq manually on the **Consciousness** page.
