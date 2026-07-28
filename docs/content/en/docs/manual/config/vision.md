---
title: Configure vision
description: Select image understanding service provider and model for AIRI's vision module
---

The vision module sends captured images to a model that supports image input. Vision providers use the same kinds of fields as their chat counterparts, but AIRI stores their settings separately under the vision provider. Enter and save the credentials again on the Vision provider page.

::: info Why do the fields look the same?
The same service often provides both chat and image-understanding models, so the forms use matching fields. The saved values are independent, and you must still choose a model that explicitly supports image input.
:::

::: warning Before using screen vision, you need to start Vision Capture
When configuring only the vision service provider and model, there is no need to enable this tool.

To have AIRI analyze your screen or window, go to "System → Developer → Vision Capture": grant screen recording permission, select the window or display you want to capture, and click "Start ticker". If you want to provide the recognition results to the AIRI dialog, then turn on "Publish to character".

Vision Capture is the current desktop debugging/development workflow; leaving the page will stop the capture loop. For complete instructions, see [Desktop Developer Tools](/docs/contributing/desktop-developer-tools#vision-capture).
:::

## Step one: Choose a visual service provider

1. Open **Settings → Providers → Vision**.
2. Select the vision provider you want to configure.
3. Fill in and save the credentials on this page. The fields match the chat provider version, such as API Key, Base URL, Azure resource information, or Amazon Bedrock Region, but the saved values are separate.

Vision and chat providers have corresponding forms, so you can enter the same account credentials in both when appropriate. Saving the chat form does not populate the vision form. A model that explicitly supports image input must still be selected in the model list.

::: warning Image and Credential Security
Visual analysis will send the footage to the chosen service provider. Do not capture footage containing API keys, passwords, personal information, or unauthorized content; and credentials for cloud services must not be submitted to a repository, screenshotted, or sent to others.
:::

## Step 2: Select the visual model

1. Open **Settings → Vision**.
2. Select the service provider you just configured.
3. Select a model that supports image or visual input from the model list.
4. Enable the required visual functions and follow the page prompts to select the image source or capture method. If necessary, you can set the Capture interval, which is the "capture interval", to adjust the capture time interval.

## Step 3: Configuration verification

1. Use a test screen that does not contain sensitive information.
2. Trigger a visual analysis.
3. When AIRI returns the screen description or corresponding context, it means that the service provider, model and screen input have been configured successfully.

## Local visual model

Ollama and LM Studio are available as local visual service providers. First run a model that supports image input locally and confirm that its service address can be accessed by AIRI; then fill in or retain the corresponding Base URL on the visual service provider page, and select the visual model from the model list.

## Troubleshooting

|Phenomenon|Priority check|
| --- | --- |
|The service provider cannot save|Complete the required vision-provider fields, such as API Key, Azure Resource Name, or Bedrock Region, even if the chat provider is already configured.|
|The model cannot analyze the image|Whether the model explicitly supports image input; switch to the visual model provided by the service provider.|
|Local model is not reachable|Whether the local service is running, Base URL, port, CORS and LAN access settings.|
|The request was rejected or the quota was insufficient.|Service provider account permissions, model available areas, quota and network connection.|
