---
title: Configure vision
description: Select an image-understanding provider and model for AIRI's vision module
---

The vision module sends captured images to a model that supports image input. Vision providers use the same kinds of fields as their chat counterparts, but AIRI stores their settings separately. Enter the credentials again on the Vision provider page.

::: info Why do the fields look the same?
The same service often provides both chat and image-understanding models, so the forms use matching fields. The saved values are independent, and you must still choose a model that explicitly supports image input.
:::

::: warning Before using screen vision, you need to enable Vision Capture
When configuring only the vision service provider and model, there is no need to enable this tool.

To have AIRI analyze your screen or window, open **System → Developer → Vision Capture**, grant screen-recording permission if needed, select a window or display, and click **Start ticker**. To send the results to the current character, enable **Publish to character**.

Vision Capture is the current desktop debugging/development workflow; leaving the page will stop the capture loop. For complete instructions, see [Desktop Developer Tools](/en/docs/contributing/desktop-developer-tools#vision-capture).
:::

## Choose a vision provider

1. Open **Settings → Providers → Vision**.
2. Select the vision provider you want to configure.
3. Enter the credentials on this page. The fields match the chat-provider version, such as API Key, Base URL, Azure resource information, or AWS Region, but the saved values are separate.

You can enter the same account credentials in both Chat and Vision when appropriate. Saving the credentials in chat providers does not autofill credentials in vision providers.

::: warning Image and Credential Security
Visual analysis sends captured frames to the selected provider. Do not capture API keys, passwords, personal information, or content you are not authorized to share. Never commit, screenshot, or share cloud credentials.
:::

## Select a vision model

1. Open **Settings → Modules → Vision**.
2. Select the provider you just configured.
3. Select a model that supports image input.
4. Set **Capture interval** to control how frequently the vision ticker captures a frame.

On desktop, the current screen or window source is selected separately under **System → Developer → Vision Capture**, as described above.

## Verify the configuration

1. Capture a window that does not contain sensitive information.
2. Trigger a visual analysis.
3. Confirm that AIRI receives a description or other context from the captured frame.

## Local visual model

Ollama and LM Studio are available as local vision providers. Run a model that supports image input and confirm that AIRI can reach its service. Then enter or keep the corresponding Base URL on the Vision provider page and select the model under **Settings → Modules → Vision**.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| The provider does not validate | Complete the required Vision fields, such as API Key, Azure Resource Name, or AWS Region, even if the Chat provider is already configured. |
| The model cannot analyze the image | Confirm that the model explicitly supports image input and select a compatible vision model. |
| The local model is unreachable | Check that the local service is running and that the Base URL, port, CORS, and LAN-access settings are correct. |
| The request is rejected or quota is exhausted | Check account permissions, API Key, regional model availability, quota, and network access. |
