---
title: OpenAI and compatible APIs
description: Configuring OpenAI or an OpenAI-compatible chat service in AIRI
is_openai_compatible: true
---

Select **OpenAI** when using the official OpenAI address; select **OpenAI compatible API** when using a third-party compatible address. After completing the configuration, AIRI can use the chat model of the corresponding service provider in "Awareness".

::: info Why choose OpenAI or Compatible API?
If you already have an OpenAI API Key, or the service provider explicitly provides an OpenAI-compatible chat interface, you can use this configuration method. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Step 1: Get the API key

1. When using OpenAI official services, open [OpenAI API Keys](https://platform.openai.com/api-keys) to create an API Key; when using compatible services, open the management console of the corresponding service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → OpenAI** or **OpenAI Compatible API**.
2. Paste the API Key into the basic settings.
3. When using OpenAI official services, keep the default Base URL: `https://api.openai.com/v1`; when using compatible services, fill in the API root address provided by the service provider's documentation, and do not append the `/chat/completions` path.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When using a compatible service, please confirm that it explicitly supports the OpenAI Chat Completions API and check that the Base URL is the root address specified in the service provider's documentation.
