# Sherpaw models for Vite

This plugin exposes pinned speech model URLs to Vite applications. Hosts select local models separately for development and builds.

```ts
import { paraformerBilingualZhEn } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { Sherpaw } from '@proj-airi/vite-plugin-sherpaw'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Sherpaw({
    models: [paraformerBilingualZhEn],
    developmentModels: [paraformerBilingualZhEn],
    bundledModels: [paraformerBilingualZhEn],
  })],
})
```

## Presets

| Export from `@proj-airi/provider-inference/sherpaw-transcription/models` | Languages | Source format | Size before compression |
| --- | --- | --- | --- |
| `paraformerBilingualZhEn` | Chinese, English | Sherpaw data and metadata | About 237 MB |
| `zipformerMultilingual` | Arabic, English, Indonesian, Japanese, Russian, Thai, Vietnamese, Chinese | Sherpaw data and metadata | About 339 MB |
| `xAsrBilingualZhEnInt8` | Chinese, English | Sherpaw data and metadata | About 169 MB |

The required `models` option controls which presets the runtime can use. Remote presets load on demand.
`developmentModels` selects local models for Vite development. `bundledModels` selects files for production builds.
Set `cacheDir` to share downloads between applications:

```ts
import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from '@proj-airi/provider-inference/sherpaw-transcription/models'

Sherpaw({
  models: [paraformerBilingualZhEn, zipformerMultilingual, xAsrBilingualZhEnInt8],
  developmentModels: [paraformerBilingualZhEn],
  bundledModels: [paraformerBilingualZhEn],
  cacheDir: '../../.cache',
})
```

All presets use published data and metadata pairs from pinned Hugging Face revisions in the `moeru-ai` repositories.
The plugin copies these pairs without repacking ONNX files. Model licenses remain those of their source repositories.

The plugin downloads local files to a revision-scoped cache. It removes its previous `public/sherpaw` output before Vite starts.
Production builds add only `bundledModels` to the Vite asset graph. An empty list for the current mode performs no model download.
The download cache survives selection changes. Its default path is `.cache` relative to the Vite root.

`@proj-airi/provider-inference/sherpaw-transcription/models` owns the preset contract, including recognizer architecture and supported languages. The build plugin does not own runtime model metadata.

Local download failures stop startup or the build. Development serves `developmentModels` through Vite.
Remote files keep their pinned Hugging Face URLs and load when recognition starts.

AIRI's VAD model has a separate download path, so this plugin alone does not make the complete application work offline.

## Runtime URLs and remote storage

The plugin replaces `@proj-airi/vite-plugin-sherpaw/assets` with URL imports for the selected models:

```ts
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

const model = assets['paraformer-zh-en']
```

Each entry has `data`, `metadata`, and `source` fields. `source` is `remote` or `bundled`.
Vite resolves bundled URLs for the application base. Hosts without the plugin receive an empty catalogue and cannot use this Provider.

`?url&no-inline` keeps both files in the asset graph. With Basemove, include `.data` and `.metadata` files and keep its local deletion enabled.
Basemove rewrites the URLs, uploads the files, and removes them from the deployment directory. Remote storage must allow browser requests through CORS.

Electron release builds keep local copies. AIRI rewrites their model URLs to `airi-sherpaw://assets/` in `electron.vite.config.ts`.
The main process serves these URLs from the renderer package. Renderer `fetch()` cannot read the same files through `file://`.

## Development loading

The plugin downloads only configured `developmentModels` before the Vite development server starts. Existing cache files are reused.
AIRI Electron uses the repository's `.cache/sherpaw/<model-id>/<revision>/` directory for all three development models.

Vite converts the generated URL imports into local development URLs. Files outside the application root use Vite's `/@fs/` route. Sherpaw reads the selected model through that server when recognition starts. Basemove runs only during production builds.

AIRI Web and Stage Pocket keep all three presets remote in development and production.
Electron development downloads about 745 MB once.
Later development runs serve the files from `.cache`. Desktop release workflows bundle all three presets. Ordinary CI builds keep them remote.
