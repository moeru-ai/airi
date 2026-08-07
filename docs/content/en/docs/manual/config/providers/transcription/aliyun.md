---
title: Alibaba Cloud NLS
description: Configure Alibaba Cloud Intelligent Speech Interaction (ASR) in AIRI
---


Alibaba Cloud NLS provides real-time speech-to-text (ASR) for AIRI. After configuration, select Alibaba Cloud NLS under "Hearing" and test the microphone input.


::: info Why choose Alibaba Cloud NLS?


If you already use an Alibaba Cloud account and need real-time speech recognition, you can select Alibaba Cloud NLS.


:::


## Step 1: Prepare Credentials


1. Enable the service and create a project in the [Alibaba Cloud Intelligent Speech Interaction console](https://nls-portal.console.aliyun.com/overview), and copy the project's **AppKey**.
2. In **AccessKey Management**, create a RAM user AccessKey with the required permissions.
3. Copy the **AccessKey ID** and **AccessKey Secret**; the Secret is usually shown in full only once.


::: warning AccessKey Security


Do not commit the AccessKey ID, AccessKey Secret, or AppKey to the repository, put them in screenshots, or share them with others. Follow the principle of least privilege; if credentials leak, disable them immediately in the Alibaba Cloud console and create new ones.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Transcription → Alibaba Cloud NLS**.
2. Fill in the **AccessKey ID**, **AccessKey Secret**, and **AppKey**.
3. Select the region closest to you, such as East China `cn-shanghai`, North China `cn-beijing`, or South China `cn-shenzhen`.


## Step 3: Verify the Configuration


1. Confirm the page indicates the basic credentials pass verification.
2. Select Alibaba Cloud NLS and an audio input device under "Hearing".
3. Click "Start listening", then speak into the microphone or play some audio.
4. Confirm the text is output in real time in the transcription area; if the recognition results are inaccurate, adjust the sensitivity and test again.


## Troubleshooting


If credential verification fails, confirm the three credentials come from the same Alibaba Cloud account and project, and check the RAM user permissions. If there are no text results, confirm the system has granted AIRI microphone permission.

