---
title: LM Studio (Local Model)
description: Use a local LM Studio service to configure chat models for AIRI
---


LM Studio can run models on your machine and provide a local API. It suits users who want to run models on their own device; by default, no API key is required.


::: info Why choose LM Studio?


If you want to run models locally and manage model files yourself, LM Studio is an option that does not depend on a cloud API key.


:::


## Step 1: Start the Local Server


1. Install and open LM Studio from the [LM Studio download page](https://lmstudio.ai/download), then download and load a chat model.
2. Open **Local Server** and start the local server.
3. If AIRI cannot reach the local service, enable CORS in LM Studio's server settings.


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → LM Studio**.
2. Keep the default Base URL: `http://localhost:1234/v1/`.
3. If your LM Studio service requires authentication, fill in the API key; otherwise leave it empty.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test whether AIRI can connect to the local service.
2. **Select Model**: after the test succeeds, click here to choose the loaded model.


## Troubleshooting


If you cannot connect, first confirm the Local Server is running and that the port matches the Base URL. If AIRI and LM Studio are not on the same device, use a LAN address reachable from the AIRI device, and only expose the service on trusted networks.

