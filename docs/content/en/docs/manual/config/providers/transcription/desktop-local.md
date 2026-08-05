---
title: Desktop Local Speech Recognition (ASR/STT)
description: Use local speech recognition in the AIRI desktop client
---


Desktop-local speech recognition is only available in the AIRI desktop client and does not require a cloud API key.


::: info Why choose desktop-local speech recognition?


If you use the AIRI desktop client and want to reduce reliance on cloud transcription services, you can select this option.


:::


## Step 1: Confirm the Desktop Environment


1. Use the AIRI desktop client; this provider does not appear on the web client.
2. Ensure the device has enough disk space and computing resources for the local model.


::: warning Runtime Environment


This provider does not appear on the web client. Running the model uses local disk and computing resources.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech Recognition → App (Local)** in the AIRI desktop client.
2. Select an available model; once ready, enable it under **Settings → Hearing**.


## Step 3: Verify the Configuration


1. Allow AIRI to use the microphone and do a short voice input.
2. If the recognition result is displayed in AIRI, the configuration was successful.


## Troubleshooting


If the provider does not appear, confirm you are running the desktop client. If model preparation fails, check disk space and device resources; if there are no text results, check the system's microphone permission.

