# Sherpaw model asset lifecycle

Status: accepted

## Decision

Sherpaw model metadata and recognition logic live in `provider-inference/src/providers/local/sherpaw-transcription`. The catalogue owns stable IDs, supported languages, recognizer architecture, pinned revisions, and artifact locations. The provider owns each Worker session. The host supplies model URLs, asset fetching, and the Worker URL.

The Vite plugin exposes every configured model to the runtime. A model can use a pinned remote URL or a local URL.
`bundledModels` selects production build files. It is a subset of `models`.

Model artifact URLs come from `https://huggingface.co` by default. The plugin accepts an `endpoint` option and reads `HF_ENDPOINT`, so a deployment can serve the same pinned revisions from a mirror. The configured endpoint applies to both the download and the URL that a remote model keeps at runtime. Artifact paths and revisions do not change.
The Electron main process downloads remote desktop models outside Vite. Its build resolves the endpoint with the plugin's `resolveModelEndpoint`, so desktop downloads use the same mirror as the renderer.

Web and Pocket expose remote models and install the selected model in OPFS.
Desktop development installs selected models in the application user data directory.
Desktop release workflows set `SHERPAW_BUNDLE_MODELS=true` and package X-ASR. Other models remain remote.
Vite rewrites bundled model URLs to `airi-sherpaw://assets/` in Electron builds.
The main process serves bundled model files through this protocol.
Renderer `fetch()` cannot read the same files through `file://`.

The UI derives its model options from the assets exposed by the host. It renders localized language names from `supportedLanguages`. It must not duplicate language lists in translation files or offer a model that the host did not expose.

## Runtime lifecycle

Model availability, installation, selection, and activation are separate states:

- The catalogue says that a model exists.
- The host asset module says that the model is remote or bundled.
- The asset repository records whether a remote model is missing, downloading, installed, or failed.
- Provider configuration selects a model ID.
- A runtime manager owns the active recognizer and its Worker.

The current Sherpaw transport disposes its Worker session when one streaming transcription finishes. A later implementation must add a long-lived runtime boundary before it claims to reuse model memory. It must not describe browser HTTP caching as recognizer reuse.

## Platform storage

Web and Pocket store remote models in OPFS. The WebView must support `navigator.storage.getDirectory()` for this path.
Electron stores remote models under the application user data directory. Eventa reports status and controls downloads.
The `airi-model` protocol serves installed files to the renderer. Renderer code does not access Node filesystem APIs.

The shared asset repository provides these operations:

```text
list()
inspect(modelId)
remove(modelId)
ensureAvailable(modelId)
open(modelId, fileName)
cancel(modelId)
clear()
subscribe(listener)
dispose()
```

The repository publishes storage status. Inference adapters publish Worker status separately.
Delete all data in Data settings calls `clear()`. It removes every stored model, including models that the catalogue no longer lists.
Desktop's Resource Status Island and Sherpaw settings read storage status.
Downloaded file pairs become installed only after both files and a version marker are stored.

Startup does not wait for remote model downloads. A download starts when recognition needs the model, or when the user starts it in settings.

## Build profiles

| Profile | Remote models | Local models |
| --- | --- | --- |
| Web development and release | All configured models | None |
| Desktop development | All configured models | None |
| Pull request CI | All configured models | None |
| Desktop release | Paraformer and multilingual Zipformer | X-ASR in the application package |
| Unit tests | Fixture metadata only | None |

CI jobs that do not package a desktop release do not download production model artifacts.
Downloads use the model ID and pinned revision as the storage key.

## Failure behavior

Provider activation requires at least one host-exposed model. A remote download can fail because of network policy, CORS, or storage quota.
The failure remains visible. The Provider does not switch to another model.

Switching models rejects or finishes in-flight recognition before disposing the old runtime. A partial download is not installed.
Revision changes create a new asset identity and do not overwrite a working older revision before validation succeeds.
After the new revision commits, storage removes the older revisions of that model. Removing a model removes all of its revisions.

## Non-goals

This decision does not claim that the current Sherpaw transport keeps a recognizer alive between recordings.
Pinned revisions identify assets, but the current catalogue has no file digests for cryptographic integrity checks.

## Verification

Tests cover repository state, complete file pairs, incomplete downloads, and OPFS persistence with small fixtures.
Packaged Electron URLs, device OPFS support, quota failures, and runtime switching still need integration tests.
