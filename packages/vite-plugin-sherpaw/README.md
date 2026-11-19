# Sherpaw models for Vite

This plugin exposes pinned Sherpaw preload packs to Vite applications. Hosts select local packs separately for development and builds.

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

The plugin also accepts a keyword spotting pack. AIRI pins it as `kwsModel` in `@proj-airi/stage-ui/libs/voice/kws-model-info`.
Its preload pair contains the encoder, the decoder, the joiner, and the token vocabulary. It is about 13 MB.

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

### Mirrors

Model artifacts come from `https://huggingface.co` by default. A host that cannot reach the Hub sets `HF_ENDPOINT`, the same variable `huggingface_hub` reads, and every application picks it up without a change:

```shell
HF_ENDPOINT=https://hf-mirror.com pnpm dev:tamagotchi
```

Pass `endpoint` to set the base URL in one Vite config instead:

```ts
Sherpaw({
  models: [paraformerBilingualZhEn],
  developmentModels: [paraformerBilingualZhEn],
  endpoint: 'https://hf-mirror.com',
})
```

The option wins over the variable. A trailing slash is accepted either way.

The endpoint covers both downloads and the URL that a remote model keeps at runtime. Artifact paths keep the pinned `moeru-ai` repository and revision, so a mirror only has to serve the same layout.

A host that downloads remote models outside Vite calls `resolveModelEndpoint` to get the same base URL. Stage Tamagotchi uses it for downloads in the Electron main process.

All presets use published data and metadata pairs from pinned Hugging Face revisions in the `moeru-ai` repositories.
The plugin copies these pairs without repacking ONNX files. Model licenses remain those of their source repositories.

The plugin downloads local files to a revision-scoped cache. It removes its previous `public/sherpaw` output before Vite starts.
Production builds add only `bundledModels` to the Vite asset graph. An empty list for the current mode performs no model download.
The download cache survives selection changes. Its default path is `.cache` relative to the Vite root.

`@proj-airi/provider-inference/sherpaw-transcription/models` owns the transcription presets, including recognizer architecture and supported languages.
Stage UI owns the keyword spotting pack identity. The plugin reads only the ID, repository, revision, and artifact directory of each pack (`SherpawModelArtifacts`).

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
AIRI Electron and Stage Pocket use the repository's `.cache/sherpaw/<model-id>/<revision>/` directory for the keyword spotting pack.

Vite converts the generated URL imports into local development URLs. Files outside the application root use Vite's `/@fs/` route. Sherpaw reads the selected model through that server when recognition starts. Basemove runs only during production builds.

All AIRI hosts keep the transcription presets remote in development. The host model asset service installs them when recognition needs them.
Desktop release workflows bundle X-ASR. Ordinary CI builds keep all transcription presets remote.
Electron and Pocket always bundle the keyword spotting pack. Web keeps it remote. The renderer model asset repository installs it in OPFS when wake word detection first prepares.
