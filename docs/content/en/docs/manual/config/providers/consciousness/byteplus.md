---
title: BytePlus
description: Configuring the BytePlus chat model in AIRI
---

BytePlus uses Ark-compatible chat service configuration in AIRI.

::: info Why choose BytePlus?
If you have created an Ark model endpoint in BytePlus, you can use the endpoint and credentials directly in AIRI.
:::

## Step 1: Prepare BytePlus credentials

1. Open and log in to the [BytePlus Console](https://console.byteplus.com/)，创建或查看 Ark endpoint and its access credentials.

::: warning API Key Security
Do not submit API keys or endpoint credentials to the repository, take screenshots, or send them to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → BytePlus**, and fill in the API Key, endpoint or model information according to the BytePlus console.
2. Do not guess the Endpoint ID; copy the actual ID of the endpoint created in the console.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network and credentials are correct.
2. **Select model**: After the test is successful, go to **Settings → Consciousness** to select the service provider and model.

## Troubleshooting

When verification fails, check whether the API Key, Endpoint ID and model information come from the same BytePlus Ark project. Do not manually guess the Endpoint ID; copy the actual ID from the console.
