---
title: LM Studio (local model)
description: Configuring chat models for AIRI using local LM Studio services
---

LM Studio can run models natively and provides a native API. It's suitable for users who want to run models on their own devices; no API Key is required by default.

::: info Why choose LM Studio?
If you want to run the model locally and manage the model files yourself, LM Studio is an option that does not rely on the cloud API Key.
:::

## Step one: Start local service

1. From the [LM Studio Download Page](https://lmstudio.ai/download)安装并打开 LM Studio, then download and load a chat model.
2. Open **Local Server** and start the local server.
3. If AIRI cannot access local services, enable CORS in LM Studio's server settings.

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → LM Studio**.
2. Keep the default Base URL: `http://localhost:1234/v1/`.
3. If your LM Studio service requires authentication, fill in the API Key; otherwise, leave it blank.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether AIRI can connect to local services.
2. **Select Model**: After the test is successful, click here to select the loaded model.

## Troubleshooting

When unable to connect, first confirm that the Local Server is running and the port is consistent with the Base URL. If AIRI and LM Studio are not on the same device, use a LAN address accessible from the AIRI device and only open the service on a trusted network.
