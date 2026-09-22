# Sherpaw model asset lifecycle

Status: accepted

## Decision

Sherpaw model metadata lives in `@proj-airi/sherpaw-models`. The catalogue owns stable IDs, supported languages, recognizer architecture, pinned revisions, and artifact locations. It does not own storage or runtime state.

The Vite plugin exposes every configured model to the runtime. A model can use a pinned remote URL or a bundled URL. `bundledModels` is an explicit subset of `models`; the plugin downloads only that subset.

Web builds expose remote models and download the selected model when recognition starts. Desktop development and ordinary CI use the same lazy behavior. Desktop release workflows set `SHERPAW_BUNDLE_DEFAULT_MODEL=true` and bundle Paraformer as the default model. Other models remain pinned remote downloads.

The UI derives its model options from the assets exposed by the host. It renders localized language names from `supportedLanguages`. It must not duplicate language lists in translation files or offer a model that the host did not expose.

## Runtime lifecycle

Model availability, installation, selection, and activation are separate states:

- The catalogue says that a model exists.
- The host asset module says that the model is remote or bundled.
- A future asset repository records whether a remote model is downloading, installed, invalid, or unavailable.
- Provider configuration selects a model ID.
- A runtime manager owns the active recognizer and its Worker.

The current Sherpaw transport disposes its Worker session when one streaming transcription finishes. A later implementation must add a long-lived runtime boundary before it claims to reuse model memory. It must not describe browser HTTP caching as recognizer reuse.

## Platform storage

Web storage will use an origin-owned large-file store with progress, cancellation, revision validation, quota handling, and deletion. Electron storage will be owned by a main-process service and exposed through an Eventa contract. Renderer code will not access Node filesystem APIs.

The shared asset service will provide these domain operations:

```text
listAssets()
download(modelId)
remove(modelId)
ensureAvailable(modelId)
activate(modelId)
dispose()
```

The service will publish download and activation progress through the shared inference status model. Desktop's Resource Status Island and Web settings will consume that same state.

## Build profiles

| Profile | Remote models | Bundled models |
| --- | --- | --- |
| Web development and release | All configured models | None |
| Desktop development | All configured models | None |
| Pull request CI | All configured models | None |
| Desktop release | All configured models | Paraformer |
| Unit tests | Fixture metadata only | None |

CI jobs that do not package a desktop release must not download production model artifacts. Release caching, when added, will use the model ID and pinned revision as the cache key.

## Failure behavior

Provider activation requires at least one host-exposed model. Selecting a remote model can fail because of network policy, CORS, quota, or integrity checks. Those failures remain visible and do not silently fall back to a different model.

Switching models will reject or finish in-flight recognition before disposing the old runtime. A partially downloaded model is not installed. Revision changes create a new asset identity and do not overwrite a working older revision before validation succeeds.

## Non-goals

This decision does not choose a Web storage library, add backward-compatible model IDs, or claim that the current upstream Sherpaw transport keeps a recognizer alive between recordings.

## Verification

Unit tests cover catalogue metadata, localized names, transcript assembly, and Vite asset generation. Integration tests must later cover interrupted downloads, revision changes, repeated recordings, runtime switching, packaged Electron URLs, and Web storage quota failures with small fixture artifacts.
