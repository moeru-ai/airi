---
title: Alibaba Cloud NLS
description: Configure Alibaba Cloud Intelligent Voice Interaction Service (ASR) in AIRI
---

Alibaba Cloud NLS provides AIRI with real-time speech-to-text (ASR) capabilities. After completing the configuration, select Alibaba Cloud NLS in "Hearing" and test the microphone input.

::: info Why choose Alibaba Cloud NLS?
If you already use an Alibaba Cloud account and need real-time speech recognition capabilities, you can choose Alibaba Cloud NLS.
:::

## Step 1: Prepare credentials

1. In [Alibaba Cloud Intelligent Voice Interaction Console](https://nls-portal.console.aliyun.com/overview) enable the service, create a project, and copy its **AppKey**.
2. Create a RAM user AccessKey with the required permissions in **AccessKey Management**.
3. Copy **AccessKey ID** and **AccessKey Secret**; the Secret will usually only be displayed in full once.

::: warning AccessKey Security
Do not submit the AccessKey ID, AccessKey Secret, or AppKey to the repository, screenshot it, or send it to others. Please follow the principle of least privilege; after the credentials are leaked, immediately disable and create new credentials in the Alibaba Cloud console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Recognition → Alibaba Cloud NLS**.
2. Fill in the **AccessKey ID**, **AccessKey Secret** and **AppKey**.
3. Select the area closest to you, such as East China `cn-shanghai`, North China `cn-beijing` or South China `cn-shenzhen`.

## Step 3: Verify configuration

1. The confirmation page prompts that the basic credentials verification has passed.
2. Select Alibaba Cloud NLS and audio input device in "Hearing".
3. Click "Start Monitoring" and then speak into the microphone or play an audio clip.
4. Confirm that the text can be output in real time in the transcription area; if the recognition result is inaccurate, you can adjust the sensitivity and test again.

## Troubleshooting

When credential verification fails, please confirm that the three credentials come from the same Alibaba Cloud account and project, and check the RAM user permissions. When there are no text results, please confirm that the system has granted AIRI microphone permission.
