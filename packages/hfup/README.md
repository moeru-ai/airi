<h1 align="center">🧑‍🚀 hfup</h1>

<p align="center">
  A collection of tools to help you deploy, bundle HuggingFace Spaces and related assets with ease.
</p>

> Where `hfup` stands for HuggingFace up, and the word `up` was inspired from `rollup`, `tsup`, you may think it means "to make your HuggingFace work up and running".

## Features

- Still manually writing HuggingFace Spaces configurations?
- Having trouble to quickly handle and edit the `.gitattributes` file for Git LFS?
- Don't want any of the HuggingFace Spaces front-matter appear in `README.md`?
- Fighting against annoying errors when deploying your HuggingFace Spaces?

`hfup` is here to help you!

- 🚀 Automatically...
  - generate `.gitattributes` file for Git LFS.
  - generate HuggingFace Spaces front-matter in `README.md`.
  - search for your `README.md` file and merge the front-matter header.
  - generate a dedicated `README.md` file right inside the `outDir` of build.
- 🔐 Intellisense ready, type safe for Spaces configurations.
- 📦 Out of the box support for Vite.

## Installation

Pick the package manager of your choice:

```shell
ni hfup -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i hfup -D
yarn i hfup -D
npm i hfup -D
```

## Usage

```ts
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    LFS(),
    SpaceCard({
      title: 'Real-time Whisper WebGPU (Vue)',
      emoji: '🎤',
      colorFrom: 'gray',
      colorTo: 'green',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: ['onnx-community/whisper-base'],
      short_description: 'Yet another Real-time Whisper with WebGPU, written in Vue',
      thumbnail: 'https://raw.githubusercontent.com/moeru-ai/airi/refs/heads/main/packages/whisper-webgpu/public/banner.png'
    })
  ]
})
```

After bundling, a dedicated README with merged front-matter header will be generated in the root of your project:

```md
---
title: Real-time Whisper WebGPU (Vue)
emoji: 🎤
colorFrom: gray
colorTo: green
sdk: static
pinned: false
license: mit
models:
- onnx-community/whisper-base
short_description: Yet another Real-time Whisper with WebGPU, written in Vue
thumbnail: https://raw.githubusercontent.com/moeru-ai/airi/refs/heads/main/packages/whisper-webgpu/public/banner.png
---

# Real-time Whisper WebGPU (Vue)
```
