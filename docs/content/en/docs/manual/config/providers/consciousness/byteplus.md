---
title: BytePlus
description: Configuring the BytePlus chat model in AIRI
---

BytePlus uses Ark-compatible chat service configuration in AIRI.

::: info Why choose BytePlus?
Use this provider when your BytePlus account has Ark API access.
:::

## Step 1: Prepare BytePlus credentials

1. Open the [BytePlus Console](https://console.byteplus.com/) and create an API key with Ark access.

::: warning API Key Security
Do not submit API keys or endpoint credentials to the repository, take screenshots, or send them to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Chat → BytePlus** and enter the API key.
2. Keep the default Base URL unless BytePlus documents another compatible API root. Models are selected from AIRI's provider list; this form has no Endpoint ID or model input.

## Step 3: Verify configuration

1. **Validate**: Save the configuration and run the validation shown on the provider page. Then select the provider and model under **Settings → Modules → Consciousness** and send a test message.
2. **Select model**: After the test is successful, go to **Settings → Modules → Consciousness** to select the service provider and model.

## Troubleshooting

When validation fails, check the API key, Base URL, account access, and network connection. If a model is unavailable, select one from the list exposed by the provider.
