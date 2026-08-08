---
title: Configure voice input and output
description: Configuring AIRI for speech synthesis (TTS) and speech recognition (ASR/STT)
---

Speech synthesis (TTS) reads AIRI's text responses aloud; speech recognition (ASR/STT) converts microphone audio into text. You can configure either capability independently.

## Configure speech synthesis (TTS)

1. Open **Settings → Providers → Speech**, select a provider, and enter its credentials.
2. Use the provider playground, when available, to synthesize a short test sentence.
3. Open **Settings → Modules → Speech** and select the configured provider, model, and voice.

See **Service Providers → Speech Synthesis (TTS)** in the sidebar for provider-specific instructions. If your provider implements the OpenAI speech interface, see [OpenAI Compatible API (TTS)](./providers/speech/openai.md).

## Configure speech recognition (ASR/STT)

1. Open **Settings → Providers → Transcription**, select a provider, and enter its credentials.
2. Open **Settings → Modules → Hearing** and select the configured provider and model.
3. Select the correct microphone, click **Start Monitoring**, and say a brief sentence.
4. Confirm that the text appears correctly in the recognition result area.

Refer to **Service Providers → Speech Recognition (ASR/STT)** in the sidebar for provider-specific instructions. If your provider supports the OpenAI-compatible transcription interface, refer to [OpenAI Compatible API (ASR/STT)](./providers/transcription/openai.md).

## FAQ

### TTS no sound

Confirm that the Speech provider, model, and voice are selected, and check the system output device and volume. If the playground reports an error, check the API key, account credit, and model capabilities.

### ASR produces no text

Confirm that AIRI has permission to the microphone and that the correct input device is selected on the Hearing page. For real-time recognition services, network outages or browser/system microphone permissions being revoked can also result in empty results.

### Incorrect language or voice

Select a model and voice that the provider supports for the target language. Transcription language, region, and model settings must match the capabilities enabled for the provider account.

## Next step

For field and validation details, read [Common Configuration Instructions](./common.md). Provider-specific guides are under **Providers → Speech** and **Providers → Transcription**.
