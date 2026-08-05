---
title: Web Client Quick Start
description: How to use the web version of Project AIRI
---


## Welcome to AIRI!


On your first use of AIRI, you need to give AIRI a "brain". Click "Let's get started" to go to the model configuration page.


### Choose a Service Provider


Here you select your LLM provider. You can choose OpenAI, DeepSeek, Ollama, and others, or use any other API site compatible with the OpenAI format.


Fill in your API key. If you choose an OpenAI-compatible API, you also need to configure the Base URL, i.e. the API endpoint of your LLM provider. SiliconFlow is used as an example here.


![](/assets/screenshot-api-example.avif)


### Choose a Model


Select an AI model you like from the model list to serve as AIRI's brain.


::: tip


If the model you use supports reasoning, generating a reply may take a long time. We recommend using a non-reasoning model for smoother conversations.


:::


### Start Your First Conversation


Type a message in the input box to start chatting with AIRI~


![](/assets/screenshot-chat.avif)


## Eyes, Ears, and Mouth


Besides text chat, AIRI has many other ways to interact. Click [Settings] in the top-right corner of the page, then [Modules], to add more interaction features for her.


### Make AIRI Speak


Click [Speech] to configure text-to-speech. The built-in Kokoro TTS does not support Chinese, so we need to click [＋] to add a new provider. After filling in the relevant details, return to the [Speech] page and select the text-to-speech provider you just added.


### Make AIRI Hear


Sometimes typing is too much trouble; in that case you need to configure speech-to-text. Click [Hearing] to configure transcription. The browser's built-in STT has incomplete Chinese support, so we still need to create a new provider to make it work.


After configuring a speech-to-text provider, you also need to select a usable microphone. You can click the microphone icon in the input box on the AIRI home page to choose a microphone and toggle transcription on or off.


### Make AIRI See You


Not finished yet — stay tuned.


## Character Cards


AIRI ships with a built-in character card named "ReLU", and you can also write your own character card for the model. You can find the character card switcher in the top-right corner of the home page, or switch from the settings.


### Character Card Content


A character card contains AIRI's name, description, personality, behavior, and more — you can highly customize your AI.


### Character Card Settings


Each character card can select a specific model provider for each of its body modules; switching character cards lets you quickly switch your models.

