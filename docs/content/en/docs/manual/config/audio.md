---
title: Configure voice input and output
description: Configuring AIRI for speech synthesis (TTS) and speech recognition (ASR/STT)
---

Speech synthesis (TTS) reads out AIRI's text responses; speech recognition (ASR/STT) converts microphone sounds into text. The two can be configured independently: configuring only TTS can also allow AIRI to speak, and configuring only ASR can also use voice input.

## Configure speech synthesis (TTS)

1. Open **Settings → Service Provider → Speech Synthesis**, select the service provider and fill in the credentials.
2. Open **Settings → Speech** and select the configured service provider, model and tone.
3. Enter a test text on the speaking page and play it. Hearing a sound means the configuration is successful.

If your service provider is compatible with the OpenAI speech interface, refer to [OpenAI Compatible API (TTS)](./providers/speech/openai.md). When using OpenRouter's voice interface, refer to [OpenRouter (TTS)](./providers/speech/openrouter.md).

## Configure speech recognition (ASR/STT)

1. Open **Settings → Service Provider → Voice Recognition**, select the service provider and fill in the credentials.
2. Open **Settings → Hearing** and select the configured service provider and model.
3. Select the correct microphone, start the test and say a brief sentence.
4. Confirm that the text appears correctly in the recognition result area.

For Alibaba Cloud real-time identification, please refer to [Alibaba Cloud NLS](./providers/transcription/aliyun.md); for services compatible with the OpenAI transcription interface, please refer to [OpenAI Compatible API (ASR/STT)](./providers/transcription/openai.md).

## FAQ

### TTS no sound

Confirm that the voice provider, model and tone are selected, and check the system output device and volume. If the test area displays a service provider error, please first check whether the API Key, balance, and model support speech synthesis.

### ASR No text results

Confirm that AIRI has permission to the microphone and that the correct input device is selected on the Hearing page. For real-time recognition services, network outages or browser/system microphone permissions being revoked can also result in empty results.

### Incorrect language or timbre recognition

Select models or sounds that the service provider supports in the target language. The language, region, and model settings for speech recognition must be consistent with the capabilities actually enabled by the service provider.

## Next step

To understand the meaning of the API Key, Base URL, and verification process, please read [Common Configuration Instructions](./common.md). To learn how to configure a service provider, expand the sidebar "Service Provider → Speech Synthesis/Speech Recognition" and select the provider you want.
