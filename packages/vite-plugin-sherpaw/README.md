# Sherpaw models for Vite

This plugin downloads selected speech model presets with `@proj-airi/unplugin-fetch` and includes them in the application output.

```ts
import { Sherpaw } from '@proj-airi/vite-plugin-sherpaw'
import { paraformerBilingualZhEn } from '@proj-airi/vite-plugin-sherpaw/models'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Sherpaw({ models: [paraformerBilingualZhEn] })],
})
```

## Presets

| Export from `/models` | Languages | Source format | Size before compression |
| --- | --- | --- | --- |
| `paraformerBilingualZhEn` | Chinese, English | Quantized ONNX files, packed during configuration | About 237 MB |
| `zipformerMultilingual` | Arabic, English, Indonesian, Japanese, Russian, Thai, Vietnamese, Chinese | Sherpaw data and metadata | About 339 MB |

Import either preset or both. The `models` option is required. The plugin downloads and bundles only selected presets. Set `cacheDir` to share downloads between applications:

```ts
Sherpaw({
  models: [paraformerBilingualZhEn, zipformerMultilingual],
  cacheDir: '../../.cache',
})
```

Downloads use pinned Hugging Face revisions. The Paraformer preset uses the upstream `csukuangfj` repository. The Zipformer preset uses the `moeru-ai` repository. Model licenses remain those of their source repositories.

The plugin owns `public/sherpaw` and replaces it during configuration. Removed presets cannot remain in subsequent builds. Do not store application-owned files there. An empty `models` list clears the generated directory. The separate download cache survives selection changes and defaults to `.cache` relative to the Vite root.

`SherpawModel` describes the preset contract. `sherpawModelPath(preset)` returns the revision-scoped path for runtime requests. The `/models` entry contains no Node runtime imports.

Download failures stop the build. Development serves the same assets from the public directory. Use this plugin for bundled speech recognition, not remote ASR services.

AIRI's VAD model has a separate download path, so this plugin alone does not make the complete application work offline.
