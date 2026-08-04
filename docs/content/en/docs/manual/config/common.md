---
title: General Configuration Instructions
description: Learn how provider configuration works in AIRI, including the flow, fields, and verification
---


This page explains how provider configuration works in AIRI. For the API addresses, account activation methods, and model selection of a specific provider, refer to the corresponding provider page.


## Configuration Flow


1. Open **Settings → Providers** and choose a feature category: **Chat**, **Text-to-Speech**, or **Speech Recognition**.
2. Select a provider and fill in the credentials requested on the page.
3. If needed, expand the advanced settings and fill in the Base URL or other parameters provided by the provider.
4. Wait for AIRI to complete verification; once it passes, select that provider and the model or voice in the corresponding feature module.


::: warning Credential Security


Credentials and provider settings are stored in the local settings of the current device. Never expose credentials such as API keys or AccessKey Secrets in screenshots, logs, issues, or chat history.


:::


## Common Fields


| Field | Meaning | Recommended Entry |


| --- | --- | --- |


| API Key | The access token issued by the provider | Paste the complete key directly; do not add quotes or spaces. |


| Base URL | The root address of the provider API | Only modify it when the provider documentation requires it. When using a custom address, enter the full `https://` or `http://` address. |


| Model | The model ID used for chat, speech, or recognition | Prefer selecting from AIRI's list; if the list fails to load, enter it manually per the provider documentation. |


| Voice | The voice ID used by TTS | Select a model first, then choose a voice supported by that model. |


| Region | Used by some cloud services to determine the access node | Must match the project or service region in the provider's console. |


## Verification Results


Chat providers usually check network connectivity, the model list, and a short chat request. The last one may consume a small amount of provider credits. Voice and speech recognition providers verify the actual playback or recognition results in the test area of the corresponding module.


If verification fails, troubleshoot in the following order:


1. Confirm the account has activated the corresponding service and has available credits.
2. Re-copy the API key and check for stray spaces or newlines.
3. Restore the Base URL to the provider default, or check it word for word against the provider's official documentation.
4. Confirm that the network, proxy, and firewall allow access to that provider.
5. Select a model that the provider explicitly supports; do not treat a display name as the model ID.


## Next Steps


* If you need AIRI to reply with text: read [Configure a Chat Model](./llm.md).
* If you need AIRI to read replies aloud or listen to the microphone: read [Configure Voice Input and Output](./audio.md).

