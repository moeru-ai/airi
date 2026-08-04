---
title: Configure Vision
description: Select an image understanding provider and model for AIRI's vision module
---


The vision module sends captured frames to a model that supports image input, so AIRI can understand screen or camera content. AIRI does not maintain a separate set of vision API credentials: it provides a corresponding vision configuration entry for each chat provider and reuses that provider's fields.


::: info Why does vision configuration share with chat?


The same provider usually offers both chat and image understanding models. Reusing credentials reduces duplicate configuration; you still need to select a model that explicitly supports image input — text-only models cannot handle vision tasks.


:::


::: warning Vision Capture must be started before using screen vision


You do not need to enable this tool just to configure a vision provider and model.


To let AIRI analyze the screen or a window, go to "System → Developer → Vision Capture": grant screen recording permission, choose the window or display to capture, and click "Start ticker". To feed the recognition results into AIRI conversations, enable "Publish to character" as well.


Vision Capture is the current desktop debugging/development workflow; leaving the page stops the capture loop. See the [desktop developer tools](../../contributing/desktop-developer-tools#vision-capture) for the full instructions.


:::


## Step 1: Choose a Vision Provider


1. Open **Settings → Providers → Vision**.
2. Select a chat provider you have already configured or plan to configure.
3. Fill in the credentials on that provider's card. The fields match its chat provider version, such as API Key, Base URL, Azure resource information, or Amazon Bedrock Region.


Vision providers correspond one-to-one with chat providers: first complete the corresponding provider's configuration from the sidebar "Providers → Chat Providers", then use the same credentials on the Vision page. A visible vision entry does not mean every model can read images; you must still select a model that explicitly supports image input from the model list.


::: warning Image and Credential Security


Vision analysis sends the captured frames to the selected provider. Do not capture frames containing API keys, passwords, personal information, or unauthorized content; cloud service credentials must not be committed to the repository, shared in screenshots, or sent to others.


:::


## Step 2: Choose a Vision Model


1. Open **Settings → Vision**.
2. Select the provider you just configured.
3. Choose a model that supports image or vision input from the model list.
4. Enable the vision features you need and select the frame source or capture method as prompted on the page. If needed, set the Capture interval to adjust how often frames are captured.


## Step 3: Verify the Configuration


1. Use a test frame that contains no sensitive information.
2. Trigger a vision analysis.
3. When AIRI returns a description of the frame or the corresponding context, the provider, model, and frame input are configured successfully.


## Local Vision Models


Ollama and LM Studio can serve as local vision providers. First run a model that supports image input locally and confirm its service address is reachable from AIRI; then fill in or keep the corresponding Base URL on the vision provider page and select that vision model from the model list.


## Troubleshooting


| Symptom | What to check first |


| --- | --- |


| The provider cannot be saved | Whether the same credential fields as the chat version are complete, e.g. API Key, Azure resource name, or Bedrock Region. |


| The model cannot analyze images | Whether the model explicitly supports image input; switch to a vision model provided by the provider. |


| Local model unreachable | Whether the local service is running, and the Base URL, port, CORS, and LAN access settings. |


| Requests rejected or out of credits | Provider account permissions, model availability in the region, credits, and network connection. |

