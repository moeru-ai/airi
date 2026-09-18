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
| `paraformerBilingualZhEn` | Chinese, English | Sherpaw data and metadata | About 237 MB |
| `zipformerBilingualZhEn` | Chinese, English | Sherpaw data and metadata | About 199 MB |
| `zipformerMultilingual` | Arabic, English, Indonesian, Japanese, Russian, Thai, Vietnamese, Chinese | Sherpaw data and metadata | About 339 MB |

Import the presets that the application needs. The `models` option is required. The plugin downloads and bundles only selected presets. Set `cacheDir` to share downloads between applications:

```ts
import { paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual } from '@proj-airi/vite-plugin-sherpaw/models'

Sherpaw({
  models: [paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual],
  cacheDir: '../../.cache',
})
```

All presets use published data and metadata pairs from pinned Hugging Face revisions in the `moeru-ai` repositories. The plugin copies these pairs without repacking ONNX files. Model licenses remain those of their source repositories.

The plugin downloads files to a revision-scoped cache. It removes its previous `public/sherpaw` output before each build. Only selected presets enter the Vite asset graph. An empty `models` list emits no model assets. The download cache survives selection changes and defaults to `.cache` relative to the Vite root.

`SherpawModel` describes the preset contract, including the recognizer architecture and supported languages. `sherpawModelPath(preset)` returns its download cache path. The `/models` entry contains no Node runtime imports.

Download failures stop the build. Development serves the cached files through Vite. Use this plugin for bundled speech recognition, not remote ASR services.

AIRI's VAD model has a separate download path, so this plugin alone does not make the complete application work offline.

## Runtime URLs and remote storage

The plugin replaces `@proj-airi/vite-plugin-sherpaw/assets` with URL imports for the selected models:

```ts
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

const model = assets['paraformer-zh-en']
```

Each entry has `data` and `metadata` URLs. Vite resolves these URLs for the application base, including Electron's relative base. Hosts without the plugin receive an empty catalogue and cannot use this Provider.

`?url&no-inline` keeps both files in the asset graph. With Basemove, include `.data` and `.metadata` files and keep its local deletion enabled. Basemove rewrites the URLs, uploads the files, and removes them from the deployment directory. Electron builds without Basemove keep local copies. Remote storage must allow browser requests through CORS.
