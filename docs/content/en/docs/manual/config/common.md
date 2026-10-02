---
title: General configuration instructions
description: Understand AIRI's provider configuration flow, fields, and verification methods
---

This page explains how AIRI's provider configuration works. For a provider's API endpoint, account setup, and model selection, see its provider-specific guide.

## Configuration process

1. Open **Settings → Providers** and select **Chat**, **Vision**, **Speech**, **Transcription**, or **Artistry**.
2. Select a provider and enter the credentials required by its settings page.
3. If necessary, expand the advanced settings and enter the Base URL or other parameters from the provider's documentation.
4. Wait for automatic validation. Where available, use **Ping API** or the provider playground for a live test.
5. Select the provider and model or voice on the corresponding page under **Settings → Modules**.

::: warning Credential security
Credentials and provider settings are saved in the current device's local settings. Never disclose credentials such as API keys or AccessKey Secrets in screenshots, logs, issues, or chat messages.
:::

## Common fields

| Field | Meaning | Guidance |
| --- | --- | --- |
| API Key | Access token issued by the provider | Paste the complete key without adding quotes or spaces. |
| Base URL | Root URL of the provider API | If the provider's documentation requires another URL, change it. Use `https://` for remote providers. Use `http://` only for trusted local services. A remote HTTP endpoint can expose API keys and request data. |
| Model | Model ID used for chat, speech, or recognition | Prefer a model from AIRI's list. If the list cannot be loaded and the field accepts custom input, enter the exact ID from the provider's documentation. |
| Voice | Voice ID used for speech synthesis | Select the model first, then select a voice supported by that model. |
| Region | Deployment region used by some cloud services | Match the project or resource region shown in the provider console. |

## Verification results

Chat-provider forms validate required fields automatically; providers that expose **Ping API** can also send a live request, which may consume a small amount of credit. Speech-provider playgrounds test synthesis and playback when available. Test transcription from **Settings → Modules → Hearing** with the selected microphone.

When verification fails, troubleshoot in this order:

1. Confirm that the account has access to the service and available credit or quota.
2. Copy the API Key again and make sure you did not include leading or trailing spaces or line breaks.
3. Restore the default Base URL, or compare it exactly with the provider's official documentation.
4. Confirm that the network, proxy, and firewall allow access to the provider.
5. Choose a model that is explicitly supported by the provider; do not use the display name as a model ID.

## Next

- To configure text replies, read [Configure a chat model](./llm.md).
- To configure speech output or microphone input, read [Configure voice input and output](./audio.md).
