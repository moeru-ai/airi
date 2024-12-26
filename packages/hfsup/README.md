<h1 align="center">🧑‍🚀 hfsup</h1>

> `hfsup` stands for HuggingFace Space up, where the `up` is coming from `rollup`, `tsup`, you may think of "to make your work up and running".
>
> A collection of tools to help you deploy, bundle HuggingFace Spaces and related assets with ease.

```shell
pnpm i hfsup -D
```

```ts
import { LFS, SpaceCard } from 'hfsup/vite'
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
