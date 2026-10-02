---
title: Kokoro TTS (Local)
description: Configuring native Kokoro speech synthesis in AIRI
---

Kokoro runs speech synthesis as a native model in AIRI.

::: info Why choose Kokoro?
Choose Kokoro if you want to synthesize speech locally and your device has enough resources to run the model.
:::

## Prepare local operating environment

1. Open AIRI and wait for the model download to complete on first use.
2. WebGPU accelerates synthesis when available. AIRI can fall back to WASM without WebGPU, but synthesis will generally be slower and use more CPU.
3. This option does not require a cloud API key, but uses local storage, memory, and compute resources.

::: warning Local resource usage
The model uses local storage, memory, and CPU or GPU resources. If the download cannot complete, memory pressure is high, or synthesis makes the device unresponsive, use a hosted speech provider instead.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Kokoro TTS (Local)**.
2. Select an available Kokoro model provided by AIRI.

## Verify configuration

1. **Select model and voice**: After the model is prepared, select the voice, and then go to **Settings → Modules → Speech** to enable it.
2. Enter a short test sentence and confirm that AIRI plays the generated audio.

## Troubleshooting

If the model cannot load, check available storage and memory, then reopen the page and let the download finish. If WebGPU is unavailable, allow the WASM fallback more time to initialize and synthesize.
