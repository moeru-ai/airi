# @proj-airi/vite-plugin-warpdrive

Vite plugin that rewrites selected build assets (large WASM/TTF/VRM, etc.) to remote object storage and uploads them after build. It uses Vite's `renderBuiltUrl` hook so the generated bundles reference the remote URL while keeping the local file for upload.

## Why

- Keep HTML/JS bundles lean while serving heavy assets (WASM, fonts, models) from object storage/CDN.
- Simple provider abstraction; ships with an S3-compatible implementation via [`s3mini`](https://github.com/good-lly/s3mini).
- Emits an optional manifest (`remote-assets.manifest.json`) that maps built filenames to remote URLs plus hostId/hostType for debugging.

## Install

```bash
pnpm add -D @proj-airi/vite-plugin-warpdrive
```

## Usage

```ts
import { createS3Provider, WarpDrivePlugin } from '@proj-airi/vite-plugin-warpdrive'
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    WarpDrivePlugin({
      prefix: 'remote-assets', // path prefix in the bucket (default: remote-assets)
      include: [/\.wasm$/i, /\.ttf$/i, /\.vrm$/i], // which assets to rewrite/upload (required)
      // includeBy: (file, ctx) => ctx.hostId?.includes('duckdb'), // extra predicate with host info
      // contentTypeBy: (file) => file.endsWith('.wasm') ? 'application/wasm' : undefined,
      manifest: true, // emit remote-assets.manifest.json in dist
      delete: true, // delete local uploaded assets (default: true)
      clean: true, // clean remote prefix before upload (default: true if provider supports it)
      skipNotModified: true, // skip uploads if provider supports it (default: true)
      // dryRun: true, // rewrite URLs/manifest only; skip cleaning/uploading
      provider: createS3Provider({
        endpoint: process.env.S3_ENDPOINT!,
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        region: process.env.S3_REGION,
        publicBaseUrl: process.env.WARP_DRIVE_PUBLIC_BASE, // defaults to endpoint
      }),
    }),
  ],
})
```

### Options

- `provider` (required): object implementing `UploadProvider` (see below).
- `prefix`: string path prefix for uploaded keys and URLs (default: `remote-assets`; e.g. `remote-assets/assets/foo.wasm`).
- `include`: array of regex or predicate functions to decide which assets to rewrite/upload (empty array means nothing is rewritten).
- `includeBy`: optional `(filename, ctx) => boolean` for finer control (`ctx` has `hostId`, `hostType`).
- `contentTypeBy`: optional `(filename) => string | Promise<string | undefined> | undefined` resolver passed to `provider.upload`.
- `manifest`: when true, emits `remote-assets.manifest.json` describing fileName/key/url/hostId/hostType/size.
- `delete`: when true (default), delete uploaded local assets from disk after upload.
- `clean`: when true (default), call `provider.cleanPrefix(prefix)` before uploading; skipped if no prefix or provider lacks `cleanPrefix`.
- `skipNotModified`: when true (default), skip uploads if `provider.shouldSkipUpload` returns true.
- `dryRun`: when true, rewrite URLs/emit manifest without cleaning or uploading.

#### UploadProvider interface

```ts
interface UploadProvider {
  getPublicUrl: (key: string) => string
  upload: (localPath: string, key: string, contentType?: string) => Promise<void>
  cleanPrefix?: (prefix: string) => Promise<void>
  shouldSkipUpload?: (localPath: string, key: string) => Promise<boolean>
}
```

### createS3Provider

Light wrapper around `s3mini`. Required fields:

- `endpoint`: full bucket URL (e.g. `https://s3.example.com/my-bucket`).
- `accessKeyId`, `secretAccessKey`: credentials.
- Optional: `region`, `requestSizeInBytes`, `requestAbortTimeout`, `publicBaseUrl` (override public URL base), `skipNotModified` (default: true; uses ETag/MD5 to skip uploads).

## How it works

1. `renderBuiltUrl` returns the remote URL for matching assets while remembering the key/hostId/hostType.
2. `generateBundle` records assets to upload, emits the optional manifest, and leaves the local files in `dist/`.
3. `closeBundle` optionally cleans the prefix, skips unmodified uploads when supported, uploads assets, and deletes local copies (unless `delete` is false).
