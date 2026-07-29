---
title: ComfyUI (Artistry)
description: Connect local ComfyUI workflows to AIRI
---

ComfyUI lets AIRI use image-generation workflows from your local machine or a trusted LAN. Configure and activate the workflow on the provider page, then enable ComfyUI under **Settings → Modules → Artistry**.

::: info Why choose ComfyUI?
Choose ComfyUI to use your own installed models, nodes, and workflows while keeping image generation in your local environment.
:::

## Prepare ComfyUI services and workflows

1. Start ComfyUI. AIRI connects to `http://localhost:8188` by default.
2. Prepare an image workflow that can be executed directly in ComfyUI, and export its API workflow JSON from ComfyUI.
3. If AIRI and ComfyUI are not on the same device, confirm that the address can be accessed from the device where AIRI is located.

::: warning Local Services and Workflow Security
Do not expose ComfyUI's service ports to untrusted public networks. Check the nodes, model paths and parameters in the workflow before importing it, and do not import workflow JSON from unknown sources.
:::

## Configure in AIRI

1. Open **Settings → Providers → Artistry → ComfyUI**.
2. Fill in the ComfyUI Server URL; this machine uses `http://localhost:8188` by default.
3. Click **Test Connection** to confirm that AIRI can read the ComfyUI service status.
4. Upload the API workflow JSON in the Workflow area, enter a name, and select the input fields that AIRI may control.
5. Save the workflow and make it the active workflow.

## Verify configuration

1. In **Settings → Modules → Consciousness**, select a chat model that supports tool calling. AIRI needs the model to invoke the Artistry tool before ComfyUI receives a generation task.
2. Open **Settings → Modules → Artistry** and select **ComfyUI**.
3. Return to chat and ask AIRI to generate a non-sensitive image.
4. Confirm that the task appears in ComfyUI's Queue or History. A returned image confirms that the connection, active workflow, exposed fields, and chat-model tool call work.

## Troubleshooting

- **Test Connection fails:** Confirm that ComfyUI is running and that the **Server URL**, port, and network route are correct.
- **The browser reports a cross-origin error:** Restart ComfyUI with the CORS options shown on AIRI's ComfyUI provider page.
- **The workflow fails in ComfyUI:** Import the API-format workflow JSON, then confirm that every referenced custom node and model is installed.
- **No task appears in Queue or History:** Confirm that the selected chat model supports tool calling and that **Settings → Modules → Artistry** is set to **ComfyUI**. Text-only models that cannot call tools cannot start an Artistry task.
