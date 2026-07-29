---
title: Moonshot (Dark Side of the Moon)
description: Configuring Moonshot as a large model service provider in AIRI
is_openai_compatible: true
---

Moonshot provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Moonshot in Consciousness.

::: info Why choose Moonshot?
If you want to use the Moonshot model in AIRI, or already have a Moonshot API Key, you can choose this service provider directly.
:::

## Get the API key

1. Open the [Moonshot Global Console](https://platform.moonshot.ai/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the Moonshot console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Moonshot**.
2. Paste the API Key into the basic settings.
3. Keep the global Base URL `https://api.moonshot.ai/v1/`. A key from `platform.moonshot.cn` must instead use the China endpoint documented by that console; credentials and endpoints cannot be mixed between regions.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, the exact model ID provided by Moonshot can be manually entered on the Consciousness page.
