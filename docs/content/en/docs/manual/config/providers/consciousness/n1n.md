---
title: n1n
description: Configuring the n1n chat model in AIRI
---

n1n provides API-compatible chat model access in AIRI.

::: info Why choose n1n?
If you use n1n's model service, you can fill in its service address and account credentials in AIRI.
:::

## Step 1: Prepare service access method

1. Open and log in [n1n](https://n1n.ai/)，确认你的服务地址及是否需要 API Key.

::: warning Credential security
Even though the API Key is optional, don't expose your private service address, access token, or gateway configuration.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → n1n**. The default Base URL is `https://api.n1n.ai/v1/`.
2. Fill in the API Key according to n1n’s current service requirements; if your deployment allows anonymous access, leave it blank according to the deployer’s instructions.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network, service address, and credentials are correct.
2. **Select model**: After the test is successful, select the model, and then go to **Settings → Awareness** to enable it.

## Troubleshooting

When verification fails, check the service address, API Key, and deployer's access policy. If the service allows anonymous access, follow the deployer's instructions to leave the API Key blank and confirm that the address is accessible from the device running AIRI.
