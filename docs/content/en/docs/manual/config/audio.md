---
title: Configure Voice Input and Output
description: Configure text-to-speech (TTS) and speech recognition (ASR/STT) for AIRI
---


Text-to-speech (TTS) reads AIRI's text replies aloud; speech recognition (ASR/STT) converts microphone audio into text. The two can be configured independently: configuring TTS alone lets AIRI speak, and configuring ASR alone enables voice input.


## Configure Text-to-Speech (TTS)


1. Open **Settings → Providers → Speech**, select a provider, and fill in the credentials.
2. Open **Settings → Speech**, and select the configured provider, model, and voice.
3. Enter some test text on the Speech page and play it. If you hear sound, the configuration was successful.


If your provider is compatible with the OpenAI speech interface, see [OpenAI-compatible API (TTS)](./providers/speech/openai.md). When using OpenRouter's speech interface, see [OpenRouter (TTS)](./providers/speech/openrouter.md).


## Configure Speech Recognition (ASR/STT)


1. Open **Settings → Providers → Transcription**, select a provider, and fill in the credentials.
2. Open **Settings → Hearing**, and select the configured provider and model.
3. Select the correct microphone, start a test, and say a short sentence.
4. Confirm that the text appears correctly in the recognition results area.


For Alibaba Cloud real-time recognition, see [Alibaba Cloud NLS](./providers/transcription/aliyun.md); for services compatible with the OpenAI transcription interface, see [OpenAI-compatible API (ASR/STT)](./providers/transcription/openai.md).


## Common Issues


### TTS produces no sound


Confirm that a speech provider, model, and voice are selected, and check the system output device and volume. If the test area shows a provider error, first check the API key, balance, and whether the model supports speech synthesis.


### ASR produces no text results


Confirm that AIRI has microphone permission and that the correct input device is selected on the "Hearing" page. For real-time recognition services, a network interruption or revoked microphone permission in the browser/system can also cause empty results.


### Wrong recognition language or voice


Select a model or voice that supports the target language. The language, region, and model settings for speech recognition must match the capabilities actually activated on the provider.


## Next Steps


To understand the meanings of the API key, Base URL, and verification flow, read [General Configuration Instructions](./common.md). To learn how to configure providers, expand "Providers → Speech / Transcription" in the sidebar and select the provider you want.

