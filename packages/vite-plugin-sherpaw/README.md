# Sherpaw models for Vite

This plugin downloads pinned speech models with `@proj-airi/unplugin-fetch` and includes them in the application output.

```ts
import { sherpaw } from '@proj-airi/vite-plugin-sherpaw'

export default defineConfig({
  plugins: [sherpaw({ cacheDir: '../../.cache' })],
})
```

The plugin bundles a quantized Chinese/English Paraformer model and an eight-language Zipformer model. It packs Paraformer files into Sherpaw data and metadata files. The Zipformer source already supplies this format.

Downloads use immutable Hugging Face revisions. The cache and output paths include each revision. Download failures stop the build. Development serves the same assets from the public directory.

Use this plugin for applications that need bundled speech recognition. Do not use it for remote ASR services. The Chinese/English model adds about 237 MB and the eight-language model adds about 339 MB before compression. Model licenses remain those of the source repositories listed in `src/models.ts`.

The plugin supplies recognition models. AIRI's VAD model has a separate download path, so this plugin alone does not make the complete application work offline.
