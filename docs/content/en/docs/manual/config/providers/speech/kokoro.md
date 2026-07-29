---
title: Kokoro (local TTS)
description: Configuring native Kokoro speech synthesis in AIRI
---

Kokoro runs speech synthesis as a native model in AIRI.

::: info Why choose Kokoro?
If you want to process speech content locally and the device meets the model running conditions, you can choose Kokoro.
:::

## Prepare local operating environment

1. Open AIRI and wait for the model download to complete on first use.
2. WebGPU accelerates synthesis when available. AIRI can fall back to WASM without WebGPU, but synthesis will generally be slower and use more CPU.
3. This option does not require a cloud API key, but uses local storage, memory, and compute resources.

::: warning local resource usage
Local models take up download space, memory, and computing resources. Do not force enable when device resources are insufficient.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Kokoro**.
2. Select an available Kokoro model provided by AIRI.

## Verify configuration

1. **Select model and voice**: After the model is prepared, select the voice, and then go to **Settings → Modules → Speech** to enable it.
2. Enter the short text to listen; if it can be played normally, it means the model is ready.

## Troubleshooting

If the model cannot load, check available storage and memory, then reopen the page and let the download finish. If WebGPU is unavailable, allow the WASM fallback more time to initialize and synthesize.
