# `@proj-airi/stage-ui-live2d`

Shared Vue and Pixi rendering support for Live2D scenes in AIRI's web,
Electron, and pocket applications.

## Use this package for

- Rendering imported Live2D model ZIPs.
- Model previews, motion playback, expressions, focus, blink, and lip sync.
- Validating and caching Cubism 2 and Cubism 3+ model archives.

Do not use it for VRM, MMD, Spine, or static character images; those formats
have separate stage renderers.

## Importing models

Each ZIP must contain exactly one model entry point and all paths referenced by
that manifest:

```text
character-model.zip
└── character-model/
    ├── model.json          # Cubism 2
    └── data/
        ├── model.moc
        ├── physics.json
        ├── textures/
        ├── motions/
        └── expressions/
```

Cubism 3 and newer archives use `.model3.json`, `.moc3`, `.motion3.json`, and
`.exp3.json`. Keep the original relative paths and filename casing when
creating the ZIP.

Models are user-provided content. Do not add third-party model archives to
this repository or AIRI release artifacts unless their redistribution terms
explicitly permit it.

## Enabling Cubism 2

Cubism 2 requires the proprietary `live2d.min.js` Web core. Live2D
[removed every official Cubism 2.1 SDK download on 2019-09-04](https://help.live2d.com/en/other/other_20/)
and never published the core to npm, so there is no dependency to declare.

A clean clone needs no setup. The `Cubism2Core()` Vite plugin fetches the core
on first build, verifies it against a pinned SHA-256, and caches it in
`packages/stage-ui-live2d/.cubism2/cache/` — the same download-on-build shape
the repository already uses for the Cubism 5 core (`DownloadLive2DSDK`) and the
sample models, none of which are committed either.

The core is fetched from a community mirror pinned to a specific commit,
because no official download exists. `pixi-live2d-display` points its own users
at the same mirror. AIRI never redistributes the file.

**Using your own copy.** Anything already on disk outranks the download, so the
network is only reached by a checkout that has none:

1. `Cubism2Core({ sourcePath })`
2. `AIRI_CUBISM2_CORE_PATH`
3. `packages/stage-ui-live2d/.cubism2/live2d.min.js` (gitignored drop-in)
4. the pinned download

A local core is unverified until you pin it, so it warns on every startup. For
releases, pin the approved copy by checksum:

```powershell
$env:AIRI_CUBISM2_CORE_PATH = 'C:\path\to\live2d.min.js'
$env:AIRI_CUBISM2_CORE_SHA256 = '<approved-sha256>'
pnpm -F @proj-airi/stage-web build
```

Setting a checksum with no core to verify fails the build rather than quietly
producing a Cubism 3+ only artifact.

**Redirecting or disabling the download.** `AIRI_CUBISM2_CORE_URL` with
`AIRI_CUBISM2_CORE_URL_SHA256` (or the `downloadUrl` and `downloadSha256`
options) points at an internal mirror; both are required, because downloaded
bytes are never used unverified. `Cubism2Core({ downloadUrl: false })` never
touches the network.

Nothing about the download can break a build. An offline runner, a dead mirror,
or bytes that fail the checksum all leave the build Cubism 3+ only, with a
warning naming the cause. In that state Cubism 2 imports receive an actionable
validation warning instead of failing at runtime.

However the core is obtained, the plugin serves it in development and emits it
as `assets/js/live2d.min.js` in production. It remains subject to the
[Live2D SDK license](https://www.live2d.com/en/sdk/license/) and is not covered
by AIRI's MIT license.

## Verification

```shell
pnpm -F @proj-airi/stage-ui-live2d exec vitest run
pnpm -F @proj-airi/stage-ui-live2d typecheck
```
