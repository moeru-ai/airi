---
title: Ollama (Local Model)
description: Use a local Ollama service to configure chat models for AIRI
---


Ollama is an open-source local LLM runtime framework. It can run models on your own device and provide a local API; by default, no API key is required.


::: info Why choose Ollama?


If you want to run models on your machine, reduce reliance on cloud APIs, or value local processing of conversation data, Ollama is a suitable choice.


:::


## Step 1: Install Ollama


1. Visit the [Ollama website](https://ollama.com/) to download and install the version for your system.
2. Run the following command in a terminal (Terminal or PowerShell) to confirm the installation succeeded:

    ```bash

    ollama --version

    ```


## Step 2: Download and Run a Model


1. Run the following command in the terminal to download and start a model:

    ```bash

    ollama run qwen2

    ```


2. To use another model, replace `qwen2` with the corresponding model ID. The time to download a model on first use depends on the model size and your network environment.


## Step 3: Configure in AIRI


1. Open **Settings → Providers → Chat → Ollama**.
2. Keep the default Base URL: `http://localhost:11434/v1/`; if Ollama runs on another device, fill in an address reachable from that device.
3. Select Ollama and the model you just downloaded under "Consciousness".


## Step 4: Verify the Configuration


1. **Ping API**: click this button to test whether AIRI can connect to the local service.
2. **Select Model**: after the test succeeds, click here to choose the downloaded model.


## Troubleshooting


If you cannot connect, first confirm Ollama is running and that the port matches the Base URL. If AIRI and Ollama are not on the same device, use a LAN address reachable from the AIRI device, and only expose the service on trusted networks.


::: warning AIRI cannot connect to local Ollama


If Ollama is running but AIRI shows a network or CORS error, set `OLLAMA_ORIGINS` according to how you start Ollama to allow AIRI's origin to access the service, then restart Ollama. Do not expose the local service directly to the public internet just to troubleshoot.


:::

