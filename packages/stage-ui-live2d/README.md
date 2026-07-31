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

Cubism 2 requires the discontinued proprietary `live2d.min.js` Web core.
AIRI does not download or redistribute this file; you supply your own copy.

**Development.** Drop the core at
`packages/stage-ui-live2d/.cubism2/live2d.min.js` and every app picks it up
with no environment variables and no config change. The directory is
gitignored. A build using this path is unpinned, so it warns on every startup.

**Release.** Pin the approved copy by checksum instead:

```powershell
$env:AIRI_CUBISM2_CORE_PATH = 'C:\path\to\live2d.min.js'
$env:AIRI_CUBISM2_CORE_SHA256 = '<approved-sha256>'
pnpm -F @proj-airi/stage-web build
```

`AIRI_CUBISM2_CORE_PATH` (or the plugin's `sourcePath` option, which outranks
it) overrides the drop-in. Setting a checksum with no core to verify fails the
build rather than quietly producing a Cubism 3+ only artifact.

In every case the plugin serves the core in development and emits it as
`assets/js/live2d.min.js` in production. With no core at all, Cubism 3+
behavior is unchanged and Cubism 2 imports receive an actionable validation
warning.

The core remains subject to the
[Live2D SDK license](https://www.live2d.com/en/sdk/license/) and is not covered
by AIRI's MIT license.

## Verification

```shell
pnpm -F @proj-airi/stage-ui-live2d exec vitest run
pnpm -F @proj-airi/stage-ui-live2d typecheck
```
