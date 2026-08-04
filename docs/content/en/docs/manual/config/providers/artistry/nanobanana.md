---
title: Nano Banana (Artistry)
description: Configure Nano Banana image generation in AIRI
---


Nano Banana uses a Google AI Studio API key to generate images. After configuration, you can select this provider under **Settings → Art**.


::: info Why choose Nano Banana?


If you already have a Google AI Studio API key and want to use AIRI's built-in Gemini image models and resolution options directly, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey) and create an API key.
2. Confirm the account and region can use the selected image model.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it and create a new one immediately in Google AI Studio.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Art → Nano Banana** and paste the API key.
2. Choose a default model: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, or `gemini-2.5-flash-image`.
3. Choose a default resolution: 1K, 2K, or 4K.


## Step 3: Verify the Configuration


1. Open **Settings → Art** and select **Nano Banana**.
2. Generate an image using a prompt that contains no sensitive information.
3. If an image is returned successfully, the API key, model, and resolution configuration work.


## Troubleshooting


If authentication fails, check whether the API key is valid. If a model is unavailable or a request is rejected, check the Google AI Studio account, regional availability, and the current model status. If generation fails, switch to 1K resolution or another available model first, then retry.

