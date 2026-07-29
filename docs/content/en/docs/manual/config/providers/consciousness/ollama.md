---
title: Ollama (local model)
description: Configuring the chat model for AIRI using a local Ollama service
---

Ollama is an open-source runtime for running language models locally. It provides a local API and does not require an API key by default.

::: info Why choose Ollama?
If you want to run models natively, reduce dependence on cloud APIs, or place more emphasis on local processing of conversation data, Ollama is the right choice.
:::

## Install Ollama

1. Visit [Ollama official website](https://ollama.com/) and download and install the version for your operating system.
2. Run the following command in the terminal (Terminal or PowerShell) to confirm that the installation is successful:

    ```bash
    ollama --version
    ```

## Download and run the model

1. Execute the following command in the terminal to download and start a model:

    ```bash
    ollama run qwen2
    ```

2. If using another model, replace `qwen2` with the corresponding model ID. The time required to download a model for the first time depends on the model size and network environment.

## Configure in AIRI

1. Open **Settings → Providers → Chat → Ollama**.
2. Keep the default Base URL: `http://localhost:11434/v1/`; if Ollama is running on another device, fill in the address accessible by the device.
3. Select Ollama and the model you downloaded under **Settings → Modules → Consciousness**.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the downloaded model.

## Troubleshooting

If you cannot connect, first confirm that Ollama is running and the port is consistent with the Base URL. If AIRI and Ollama are not on the same device, use a LAN address accessible from the AIRI device and only open the service on trusted networks.

::: warning AIRI cannot connect to local Ollama
If Ollama is running but AIRI is showing network or CORS errors, set up `OLLAMA_ORIGINS` the way Ollama was started, allow AIRI's origin to access the service, and then restart Ollama. Do not expose local services directly to the public network to troubleshoot problems.
:::
