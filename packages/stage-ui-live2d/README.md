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

AIRI delegates Core provisioning to `Cubism2Core()` from
`@proj-airi/unplugin-live2d-sdk`. The SDK plugin verifies sources, owns its
content-addressed cache, serves development assets, emits production assets,
and exposes the browser-safe `virtual:live2d-sdk/cores` capability.

The core is fetched from a community mirror pinned to a specific commit,
because no official download exists. `pixi-live2d-display` points its own users
at the same mirror. AIRI never redistributes the file.

The shared AIRI policy checks sources in this order:

1. `AIRI_CUBISM2_CORE_PATH`
2. `packages/stage-ui-live2d/.cubism2/live2d.min.js` (gitignored drop-in)
3. `AIRI_CUBISM2_CORE_URL` with `AIRI_CUBISM2_CORE_URL_SHA256`
4. the pinned community mirror

A local core is unverified until you pin it, so it warns on every startup. For
releases, pin the approved copy by checksum:

```powershell
$env:AIRI_CUBISM2_CORE_PATH = 'C:\path\to\live2d.min.js'
$env:AIRI_CUBISM2_CORE_SHA256 = '<approved-sha256>'
pnpm -F @proj-airi/stage-web build
```

`AIRI_CUBISM2_CORE_URL` is ignored without its SHA-256 because the upstream SDK
requires integrity for every URL source. Local sources may be unpinned during
development, while production emission requires an expected SHA-256.

All AIRI sources are optional. An unavailable source therefore produces the
SDK's supported unavailable capability and leaves the build Cubism 4/5 only.
In that state validation rejects Cubism 2 archives before import.

The runtime consumes the capability URL directly. The SDK supplies a base-aware
URL for both web builds and packaged Electron's relative `base: './'`, plus SRI
and the expected global name used to verify script initialization.

The core remains subject to the
[Live2D SDK license](https://www.live2d.com/en/sdk/license/) and is not covered
by AIRI's MIT license.

## Verification

```shell
pnpm -F @proj-airi/stage-ui-live2d exec vitest run
pnpm -F @proj-airi/stage-ui-live2d typecheck
```
