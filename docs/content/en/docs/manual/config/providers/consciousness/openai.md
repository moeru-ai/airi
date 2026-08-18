---
title: OpenAI and compatible APIs
description: Configuring OpenAI or an OpenAI-compatible chat service in AIRI
is_openai_compatible: true
---

Select **OpenAI** for the official OpenAI endpoint, or **OpenAI Compatible** for a third-party compatible endpoint. After completing the configuration, select the provider and chat model under **Settings → Modules → Consciousness**.

::: info Why choose OpenAI or Compatible API?
If you already have an OpenAI API Key, or the service provider explicitly provides an OpenAI-compatible chat interface, you can use this configuration method. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Get the API key

1. When using OpenAI official services, open [OpenAI API Keys](https://platform.openai.com/api-keys) to create an API Key; when using compatible services, open the management console of the corresponding service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → OpenAI** or **OpenAI Compatible**.
2. Paste the API Key into the basic settings.
3. When using OpenAI official services, keep the default Base URL: `https://api.openai.com/v1`; when using compatible services, fill in the API root address provided by the service provider's documentation, and do not append the `/chat/completions` path.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. For a compatible service, confirm that it supports the OpenAI Chat Completions API and that the Base URL is the API root documented by the provider.
