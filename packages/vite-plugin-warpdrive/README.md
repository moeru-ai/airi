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
      prefix: 'remote-assets', // optional path prefix in the bucket
      include: [/\.wasm$/i, /\.ttf$/i, /\.vrm$/i], // which assets to rewrite/upload
      // includeBy: (file, ctx) => ctx.hostId?.includes('duckdb'),
      // contentType: (file) => file.endsWith('.wasm') ? 'application/wasm' : undefined,
      manifest: true, // emit remote-assets.manifest.json in dist
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

- `prefix`: string path prefix for uploaded keys and URLs (e.g. `remote-assets` -> `remote-assets/assets/foo.wasm`).
- `include`: array of regex or predicate functions to decide which assets to rewrite/upload.
- `includeBy`: optional `(filename, ctx) => boolean` for finer control (ctx has `hostId`, `hostType`).
- `manifest`: when true, emits `remote-assets.manifest.json` describing fileName/key/url/hostId/hostType/size.
- `contentType`: optional `(filename) => string | undefined` resolver passed to the provider upload.
- `logger`: optional logger ({ info, warn, error }) for custom logging sinks.
- `provider`: any object implementing `{ getPublicUrl(key): string; upload(localPath, key, contentType?): Promise<void> }`.

### createS3Provider

Light wrapper around `s3mini`. Required fields:

- `endpoint`: full bucket URL (e.g. `https://s3.example.com/my-bucket`).
- `accessKeyId`, `secretAccessKey`: credentials.
- Optional: `region`, `requestSizeInBytes`, `requestAbortTimeout`, `publicBaseUrl` (override public URL base).

## How it works

1. `renderBuiltUrl` returns the remote URL for matching assets while remembering the key/hostId/hostType.
2. In `generateBundle`, local artifacts are uploaded via the provider.
3. Optional manifest is emitted for traceability/debugging.
