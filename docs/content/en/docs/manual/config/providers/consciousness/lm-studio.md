---
title: LM Studio (local model)
description: Configuring chat models for AIRI using local LM Studio services
---

LM Studio can run models natively and provides a native API. It's suitable for users who want to run models on their own devices; no API Key is required by default.

::: info Why choose LM Studio?
If you want to run the model locally and manage the model files yourself, LM Studio is an option that does not rely on the cloud API Key.
:::

## Start local service

1. From the [LM Studio Download Page](https://lmstudio.ai/download) install and open LM Studio, then download and load a chat model.
2. Open **Local Server** and start the local server.
3. If AIRI and LM Studio run on different devices, enable **Serve on Local Network** in LM Studio, or bind the server to a non-loopback address.
4. If AIRI runs on another device, use the LAN address of the LM Studio device in AIRI.
5. If a browser blocks the request because of CORS, enable CORS in LM Studio. CORS does not provide network reachability or authentication.

::: warning Network security
Do not expose the LM Studio server to the public internet. Use it only on a trusted local network.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → LM Studio**.
2. Keep the default Base URL: `http://localhost:1234/v1/`. For a service on another device, replace `localhost` with its LAN address.
3. If your LM Studio service requires authentication, fill in the API Key; otherwise, leave it blank.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the loaded model.

## Troubleshooting

When AIRI cannot connect, make sure that the Local Server is running and that the port matches the Base URL. If AIRI and LM Studio run on different devices, use a LAN address that the AIRI device can reach.
