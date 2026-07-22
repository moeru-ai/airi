---
title: MiniMax Global
description: Configure the overseas version of MiniMax in AIRI as a large model service provider
is_openai_compatible: true
---

This page applies to API Keys created on the MiniMax overseas platform. Once configured, AIRI can use the chat model provided by MiniMax Global in Awareness.

::: info Why choose MiniMax Global?
If you create an API Key on the MiniMax overseas platform or use an overseas Token Plan, you should choose MiniMax Global. Please use [MiniMax (Mainland China)](./minimax.md) for the Key created by the Chinese mainland platform; the API Key, billing and Base URL of the two platforms cannot be mixed.
:::

## Step 1: Obtain API Key

1. Open and log in to [MiniMax Global Platform](https://platform.minimax.io/)。
2. Create a pay-as-you-go API Key in **API Keys**; if using Token Plan, please obtain its dedicated Key on the corresponding subscription page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key on the MiniMax Global platform.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → MiniMax Global**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.minimax.io/v1/`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select Model**: After the test is successful, click here to select the specific model you want to use.
3. Select MiniMax Global and the model in **Settings → Awareness** and send a short message to confirm that AIRI can reply.

## Troubleshooting

When pinging the API fails, confirm that the API Key comes from an overseas platform, the Base URL is `https://api.minimax.io/v1/`, and check the account limit and network connection. When 401 occurs, the common reason is that the keys or addresses of mainland China and overseas platforms are mixed. When the model list fails to load, the exact model ID provided by MiniMax Global can be manually entered on the Awareness page.
