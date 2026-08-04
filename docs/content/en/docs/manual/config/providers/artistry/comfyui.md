---
title: ComfyUI (Artistry)
description: Connect a local ComfyUI workflow in AIRI
---


ComfyUI lets AIRI use image generation workflows on your machine or a trusted LAN. After configuration, you can select ComfyUI under **Settings → Art** and let AIRI generate images using a saved workflow.


::: info Why choose ComfyUI?


If you want to use your own installed models, nodes, and workflows and keep image generation in the local environment, ComfyUI is AIRI's local art provider.


:::


## Step 1: Prepare the ComfyUI Service and Workflow


1. Start ComfyUI. AIRI connects to `http://localhost:8188` by default.
2. Prepare an image workflow in ComfyUI that can run directly, and export its API workflow JSON from ComfyUI.
3. If AIRI and ComfyUI are not on the same device, confirm the address is reachable from the device running AIRI.


::: warning Local Service and Workflow Security


Do not expose ComfyUI's service port to untrusted public networks. Before importing a workflow, check its nodes, model paths, and parameters; do not import workflow JSON from untrusted sources.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Art → ComfyUI**.
2. Fill in the ComfyUI Server URL; for local use, the default is `http://localhost:8188`.
3. Click **Test Connection** to confirm AIRI can read the ComfyUI service status.
4. In the "Workflows" area, upload the API workflow JSON, give it a name, and select the input fields you want to expose to AIRI.
5. Save the workflow and set it as the active workflow.


## Step 3: Verify the Configuration


1. Under **Settings → Consciousness**, select a chat model that supports Tool Calling / Function Calling. AIRI needs this model to invoke the ComfyUI image generation tool.
2. Open **Settings → Art** and select **ComfyUI**.
3. Choose the workflow you just saved and start a generation with a prompt that contains no sensitive information.
4. Confirm the task appears in ComfyUI's Queue or History; when the workflow finishes and returns an image, the connection, workflow, chat model, and exposed fields are configured successfully.


## Troubleshooting


If the test connection fails, check whether ComfyUI is running, and the Server URL, port, and network access. If the browser reports a cross-origin error, restart the service with the CORS launch arguments shown on the ComfyUI settings page. If a workflow cannot run, confirm you imported the API-format JSON and that the nodes and models used are installed in ComfyUI. If no new task appears in the ComfyUI Queue, check whether the current chat provider and model support and have Tool Calling / Function Calling enabled; text-only chat models cannot trigger the generation tool.

