---
title: Configure vision
description: Select an image-understanding provider and model for Moeka's vision module
---

The vision module sends captured images to a model that supports image input. Vision providers use the same kinds of fields as their chat counterparts, but Moeka stores their settings separately. Enter the credentials again on the Vision provider page.

::: info Why do the fields look the same?
The same service often provides both chat and image-understanding models, so the forms use matching fields. The saved values are independent, and you must still choose a model that explicitly supports image input.
:::

::: warning Screen capture needs the Desktop ver.
The web version cannot capture your screen or a window. Screen capture belongs to the Desktop ver., which this project does not ship. Without a capture source, the vision module receives no image, so it stays idle.

You can still configure a vision provider and model. Moeka uses them when a capture source sends a frame.
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
4. Set **Capture interval** to control how frequently a capture source sends a frame.

## Verify the configuration

1. Configure a capture source that does not record sensitive information.
2. Trigger a visual analysis.
3. Confirm that Moeka receives a description or other context from the captured frame.

## Local visual model

Ollama and LM Studio are available as local vision providers. Run a model that supports image input and confirm that Moeka can reach its service. Then enter or keep the corresponding Base URL on the Vision provider page and select the model under **Settings → Modules → Vision**.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| The provider does not validate | Complete the required Vision fields, such as API Key, Azure Resource Name, or AWS Region, even if the Chat provider is already configured. |
| The model cannot analyze the image | Confirm that the model explicitly supports image input and select a compatible vision model. |
| The local model is unreachable | Check that the local service is running and that the Base URL, port, CORS, and LAN-access settings are correct. |
| The request is rejected or quota is exhausted | Check account permissions, API Key, regional model availability, quota, and network access. |
