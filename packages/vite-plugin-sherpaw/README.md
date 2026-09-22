# Sherpaw models for Vite

This plugin exposes pinned speech model URLs to Vite applications. It downloads only models that the host explicitly bundles.

```ts
import { paraformerBilingualZhEn } from '@proj-airi/sherpaw-models'
import { Sherpaw } from '@proj-airi/vite-plugin-sherpaw'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Sherpaw({
    models: [paraformerBilingualZhEn],
    bundledModels: [paraformerBilingualZhEn],
  })],
})
```

## Presets

| Export from `@proj-airi/sherpaw-models` | Languages | Source format | Size before compression |
| --- | --- | --- | --- |
| `paraformerBilingualZhEn` | Chinese, English | Sherpaw data and metadata | About 237 MB |
| `zipformerBilingualZhEn` | Chinese, English | Sherpaw data and metadata | About 199 MB |
| `zipformerMultilingual` | Arabic, English, Indonesian, Japanese, Russian, Thai, Vietnamese, Chinese | Sherpaw data and metadata | About 339 MB |

The required `models` option controls which presets the runtime can use. Remote presets load on demand. Add a preset to `bundledModels` only when the application must ship it. Set `cacheDir` to share bundled downloads between applications:

```ts
import { paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual } from '@proj-airi/sherpaw-models'

Sherpaw({
  models: [paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual],
  bundledModels: [paraformerBilingualZhEn],
  cacheDir: '../../.cache',
})
```

All presets use published data and metadata pairs from pinned Hugging Face revisions in the `moeru-ai` repositories. The plugin copies these pairs without repacking ONNX files. Model licenses remain those of their source repositories.

The plugin downloads bundled files to a revision-scoped cache. It removes its previous `public/sherpaw` output before each build. Only bundled presets enter the Vite asset graph. An empty `bundledModels` list performs no model download. The download cache survives selection changes and defaults to `.cache` relative to the Vite root.

`@proj-airi/sherpaw-models` owns the preset contract, including recognizer architecture and supported languages. The build plugin does not own runtime model metadata.

Bundled download failures stop startup or the build. Development serves bundled files through Vite. Remote files keep their pinned Hugging Face URLs and load when recognition starts.

AIRI's VAD model has a separate download path, so this plugin alone does not make the complete application work offline.

## Runtime URLs and remote storage

The plugin replaces `@proj-airi/vite-plugin-sherpaw/assets` with URL imports for the selected models:

```ts
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

const model = assets['paraformer-zh-en']
```

Each entry has `data`, `metadata`, and `source` fields. `source` is `remote` or `bundled`. Vite resolves bundled URLs for the application base, including Electron's relative base. Hosts without the plugin receive an empty catalogue and cannot use this Provider.

`?url&no-inline` keeps both files in the asset graph. With Basemove, include `.data` and `.metadata` files and keep its local deletion enabled. Basemove rewrites the URLs, uploads the files, and removes them from the deployment directory. Electron builds without Basemove keep local copies. Remote storage must allow browser requests through CORS.

## Development loading

The plugin downloads only configured `bundledModels` before the Vite development server starts. Existing cache files are reused. AIRI Web and Electron share the repository's `.cache/sherpaw/<model-id>/<revision>/` directory for bundled files.

Vite converts the generated URL imports into local development URLs. Files outside the application root use Vite's `/@fs/` route. Sherpaw reads the selected model through that server when recognition starts. Basemove runs only during production builds.

AIRI Web and normal development expose all three presets as remote models, so startup does not download about 775 MB. Desktop release workflows bundle the 237 MB Paraformer model and leave the other presets remote.
