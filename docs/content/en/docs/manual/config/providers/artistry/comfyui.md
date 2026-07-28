---
title: ComfyUI (Artistry)
description: Connect local ComfyUI workflows to AIRI
---

ComfyUI lets AIRI use image-generation workflows from your local machine or a trusted LAN. Configure and activate the workflow on the provider page, then enable ComfyUI under **Settings → Modules → Artistry**.

::: info Why choose ComfyUI?
If you wish to use your own installed models, nodes and workflows and leave image generation in your local environment, ComfyUI is AIRI's native art service provider.
:::

## Step 1: Prepare ComfyUI services and workflows

1. Start ComfyUI. AIRI connects to `http://localhost:8188` by default.
2. Prepare an image workflow that can be executed directly in ComfyUI, and export its API workflow JSON from ComfyUI.
3. If AIRI and ComfyUI are not on the same device, confirm that the address can be accessed from the device where AIRI is located.

::: warning Local Services and Workflow Security
Do not expose ComfyUI's service ports to untrusted public networks. Check the nodes, model paths and parameters in the workflow before importing it, and do not import workflow JSON from unknown sources.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Artistry → ComfyUI**.
2. Fill in the ComfyUI Server URL; this machine uses `http://localhost:8188` by default.
3. Click **Test Connection** to confirm that AIRI can read the ComfyUI service status.
4. Upload the API workflow JSON in the Workflow area, enter a name, and select the input fields that AIRI may control.
5. Save the workflow and make it the active workflow.

## Step 3: Verify configuration

1. Select the chat model that supports Tool Calling / Function Calling in **Settings → Modules → Consciousness**. AIRI requires the ComfyUI image generation tool to be called by the model.
2. Open **Settings → Modules → Artistry** and select **ComfyUI**.
3. Return to chat and ask AIRI to generate a non-sensitive image.
4. Confirm that the task appears in ComfyUI's Queue or History. A returned image confirms that the connection, active workflow, exposed fields, and chat-model tool call work.

## Troubleshooting

When test connection fails, check if ComfyUI is running, Server URL, port and network access. When the browser reports a cross-domain error, restart the service according to the CORS startup parameters displayed on the ComfyUI settings page. When the workflow cannot be executed, confirm that the imported API format JSON is used, and the nodes and models used have been installed in ComfyUI. If there are no new tasks in the ComfyUI Queue, check whether the current chat service provider and model support and enable Tool Calling / Function Calling; models that only support text dialogue cannot trigger the generation tool.
