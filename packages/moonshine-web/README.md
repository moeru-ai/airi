---
title: Moonshine Web (Vue)
emoji: 🌙
colorFrom: blue
colorTo: pink
sdk: static
pinned: false
license: MIT
models:
  - onnx-community/moonshine-base-ONNX
short_description: Yet another Real-time in-browser STT, re-implemented in Vue
thumbnail: https://raw.githubusercontent.com/moeru-ai/airi/refs/heads/main/packages/moonshine-web/public/banner.png
---

<h1 align="center">Moonshine Web (Vue)</h1>

<p align="center">
  [<a href="https://moonshine-web-vue.netlify.app/">Try it</a>]
</p>

> Heavily inspired by [Realtime in-browser speech recognition](https://huggingface.co/spaces/webml-community/moonshine-web)

# Moonshine Web

A simple Vue + Vite application for running [Moonshine Base](https://huggingface.co/onnx-community/moonshine-base-ONNX), a powerful speech-to-text model optimized for fast and accurate automatic speech recognition (ASR) on resource-constrained devices. It runs locally in the browser using Transformers.js and WebGPU-acceleration (or WASM as a fallback).

## Getting Started

Follow the steps below to set up and run the application.

### 1. Clone the Repository

Clone the examples repository from GitHub:

```sh
git clone https://github.com/moeru-ai/airi.git
```

### 2. Navigate to the Project Directory

Change your working directory to the `moonshine-web` folder:

```sh
cd packages/moonshine-web
```

### 3. Install Dependencies

Install the necessary dependencies using npm:

```sh
npm i
```

### 4. Run the Development Server

Start the development server:

```sh
npm run dev
```

The application should now be running locally. Open your browser and go to `http://localhost:5175` to see it in action.

## Acknowledgements

The audio visualizer was adapted from Wael Yasmina's [amazing tutorial](https://waelyasmina.net/articles/how-to-create-a-3d-audio-visualizer-using-three-js/).

Great thanks to what Xenova have done.

> [Source code](https://github.com/huggingface/transformers.js-examples/tree/38a883dd465d70d7368b86b95aa0678895ca4e83/moonshine-web)
