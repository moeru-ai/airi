---
title: General configuration instructions
description: Understand the process, fields and verification methods of service provider configuration in AIRI
---

This page explains how AIRI's provider configuration works. For the specific service provider’s API address, account opening method and model selection, please go to the corresponding service provider page.

## Configuration process

1. Open **Settings → Service Provider** and select the function category: **Chat**, **Speech Synthesis** or **Speech Recognition**.
2. Select the service provider and fill in the credentials required on the page.
3. If necessary, expand the advanced settings and fill in the Base URL or other parameters provided by the service provider.
4. Wait for AIRI to complete the verification; after passing the verification, select the service provider and model or sound in the corresponding function module.

::: warning Credential security
Credentials and provider settings are saved in the current device's local settings. Never disclose credentials such as API Key, AccessKey Secret, etc. in screenshots, logs, issues, or chat logs.
:::

## Common fields

|Field|meaning|Fill in suggestions|
| --- | --- | --- |
| API Key |Access token issued by the service provider|Paste the complete key directly without adding quotes or spaces.|
| Base URL |The root address of the service provider API|Modify only when required by the service provider's documentation. When using a custom address, fill in the complete `https://` or `http://` address.|
|Model|Model ID used for chat, speech, or recognition|Prioritize selecting from AIRI's list; if the list fails to load, fill it in manually according to the service provider's document.|
|timbre|The voice ID used when TTS reads aloud|Select the model first, then select the sounds supported by the model.|
|area|Some cloud services are used to determine access nodes|Must be consistent with the project or service area in the service provider console.|

## Verification results

Chat providers typically check for network connectivity, a list of models, and a brief chat request. The last item may consume a small amount of service provider credit. Voice service providers and speech recognition service providers will verify the actual playback or recognition results in the test area of ​​the corresponding module.

When verification fails, please troubleshoot in the following order:

1. Confirm that the account has activated the corresponding service and has available credit.
2. Copy the API Key again and check whether extra spaces or line breaks are copied.
3. Restore the Base URL to the service provider's default value, or check verbatim with the service provider's official documentation.
4. Confirm that the network, proxy, and firewall allow access to the service provider.
5. Choose a model that is explicitly supported by the provider; do not use the display name as a model ID.

## Next

* Requires AIRI reply text: Read [Configuring Chat Model](./llm.md).
* Requires AIRI to read responses or listen to the microphone: read [Configuring Voice Input and Output](./audio.md).
