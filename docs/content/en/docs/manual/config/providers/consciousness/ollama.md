---
title: Ollama (local model)
description: Configuring the chat model for AIRI using a local Ollama service
---

Ollama is an open-source runtime for running language models locally. It provides a local API and does not require an API key by default.

::: info Why choose Ollama?
If you want to run models natively, reduce dependence on cloud APIs, or place more emphasis on local processing of conversation data, Ollama is the right choice.
:::

## Install Ollama

1. Download and install Ollama for your operating system from the [official website](https://ollama.com/).
2. Run this command in Terminal or PowerShell to verify the installation:

    ```bash
    ollama --version
    ```

## Download and run the model

1. Run this command to download and start a model:

    ```bash
    ollama run qwen2
    ```

2. To use another model, replace `qwen2` with its model ID. The initial download time depends on the model size and network speed.

## Configure in AIRI

1. Open **Settings → Providers → Chat → Ollama**.
2. Keep the default Base URL, `http://localhost:11434/v1/`. If Ollama runs on another device, enter a URL that the device running AIRI can reach.
3. Select Ollama and the model you downloaded under **Settings → Modules → Consciousness**.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the downloaded model.

## Troubleshooting

If AIRI cannot connect, confirm that Ollama is running and that the Base URL uses the correct port. If AIRI and Ollama run on different devices, use a LAN address reachable from the AIRI device and expose the service only on a trusted network.

::: warning AIRI cannot connect to local Ollama
If Ollama is running but AIRI reports a CORS error, add AIRI's exact origin to `OLLAMA_ORIGINS` and restart Ollama. Do not use a wildcard or expose Ollama to the public internet as a troubleshooting shortcut.
:::
