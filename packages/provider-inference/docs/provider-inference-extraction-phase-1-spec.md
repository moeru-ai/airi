# Provider Inference Extraction Specification

Status: Proposed for architecture review

Phase: 1 of the provider extraction

Target package: `@proj-airi/provider-inference`

## 1. Purpose

This specification defines the first provider extraction from `@proj-airi/stage-ui`.

Phase 1 extracts provider definitions from `packages/stage-ui/src/libs/providers/providers`.

The package must not depend on Vue, Vue Pinia, or Browser data persistence APIs.

Browser-specific APIs are allowed when a provider needs them.

The package must load in Node.js and Browser test environments.

Each provider must declare or demonstrate the runtime that it can execute in.

This phase keeps the existing provider definition design unless a change removes a forbidden dependency.

## 2. Terms

- A **provider definition** describes configuration, validation, capabilities, and provider creation.
- A **provider instance** performs an operation such as text generation or speech generation.
- A **cloud-api provider** calls a hosted remote service.
- A **local-api provider** calls a service that runs on the user's machine or network.
- A **local-run provider** runs a model or platform capability in the current application runtime.
- A **portable provider** passes tests in both Node.js and Browser runtimes.
- A **Browser-only provider** executes in Browser but not in Node.js.
- A **runtime adapter** supplies a capability that differs between runtimes.
- A **provider registry** stores provider definitions and returns them by identifier.

## 3. Phase 1 Goals

Phase 1 has these goals:

1. Create `packages/provider-inference` as an independent workspace package.
2. Extract provider definitions that do not depend on Vue, Vue Pinia, or Browser persistence.
3. Allow Browser APIs inside provider implementations when the provider needs them.
4. Classify providers as `cloud-api`, `local-api`, or `local-run`.
5. Verify the runtime support of each provider with Node.js and Browser tests.
6. Use `vitest-plugin-fakemic` for ASR pipeline acceptance.
7. Keep the provider definition interface close to its current shape.
8. Keep UI, Pinia state, persistence, and application assembly in stage-ui.

## 4. Scope

### 4.1 Included

Phase 1 includes:

- Provider definitions under `packages/stage-ui/src/libs/providers/providers`.
- The provider registry in `providers/registry.ts`.
- Core provider types that portable or Browser provider definitions require.
- Provider validators and capability types that do not depend on Vue or Pinia.
- Provider tests that use Node.js, Browser, or explicit runtime fakes.
- Cross-runtime and Browser-specific test configuration.
- Package exports, TypeScript configuration, and the `tsdown` build configuration.

The package can use Browser APIs such as `window`, `navigator`, `MediaStream`, `SpeechRecognition`, `FileReader`, `Worker`, and WebGPU.

The package can use shared APIs such as `fetch`, `URL`, `AbortSignal`, `ReadableStream`, `Response`, `Blob`, and `ArrayBuffer`.

### 4.2 Excluded

Phase 1 excludes:

- Vue components and Vue composables.
- Vue Pinia stores and Pinia synchronization.
- Browser persistence, including `localStorage`, IndexedDB, Cache API, and cookie access.
- Electron-only native implementations.
- Stage-ui stores, authentication, server configuration, and analytics.
- `packages/stage-ui/src/services/inference-service-providers.ts`.
- The runtime implementation under `packages/stage-ui/src/libs/inference`.
- The full `@proj-airi/testing-audio` package as a dependency of the core package.

Phase 1 does not add a compatibility layer for the old provider import path.

## 5. Runtime Policy

### 5.1 Forbidden dependencies

The new package must not import or use:

- `vue`
- `vue-i18n`
- `pinia`
- `pinia-plugin-synced`
- `@proj-airi/stage-ui`
- Stage-ui stores or persistence modules
- `localStorage`
- `indexedDB`
- `caches`
- `document.cookie`
- Browser storage wrappers that use these APIs internally

Type-only imports also count as dependencies when they enter the package type graph.

### 5.2 Allowed Browser APIs

Browser APIs are not a package-wide restriction.

A provider can use a Browser API when its definition loads safely in Node.js and reports the correct availability there.

A Browser-only provider must not access the Browser API during module import.

A Browser-only provider must access the API inside a guarded availability function or inside provider execution.

The Node.js test must load the provider definition without defining Browser globals.

The Browser test must exercise the provider with a real or explicit fake Browser capability.

### 5.3 Persistence rule

Provider configuration remains in the host application.

The provider package receives configuration values as function input.

The provider package does not save credentials, model selection, validation state, or runtime state.

## 6. Runtime Classification

The classification describes provider behavior.

It does not require a new field in `ProviderDefinition` during Phase 1.

The classification uses the fixed `cloud` and `local` source folders.

### 6.1 Cloud API

Cloud API providers call hosted services.

Expected cloud API providers include:

- `302-ai`
- `aihubmix`
- `aliyun-nls`
- `amazon-bedrock`
- `anthropic`
- `atlascloud`
- `azure-ai-foundry`
- `azure-openai`
- `byteplus`
- `byteplus-coding-plan`
- `cerebras-ai`
- `cloudflare-workers-ai`
- `comet-api`
- `deepseek`
- `elevenlabs`
- `featherless-ai`
- `fireworks-ai`
- `google-gemini-audio-speech`
- `google-generative-ai`
- `groq`
- `mimo`
- `mimo-audio`
- `minimax`
- `minimax-speech`
- `mistral-ai`
- `modelscope`
- `moonshot-ai`
- `n1n`
- `novita-ai`
- `nvidia`
- `openai`
- `openai-audio`
- `openai-compatible`
- `openpaths`
- `openrouter-ai`
- `openrouter-audio-speech`
- `perplexity-ai`
- `together-ai`
- `unspeech`
- `volcengine-coding-plan`
- `xai`
- `zai`

`official` is also a cloud API provider by behavior.

Its current implementation remains excluded because it depends on Vue, Pinia, authentication, and stage-ui server state.

Some cloud API definitions also support a user-selected local endpoint.

`openai-compatible` is one example.

`cloudflare-workers-ai` remains a cloud API provider. Its name does not mean that it uses a Browser Worker.

The endpoint configuration, and not the folder name, decides the actual service location.

### 6.2 Local API

Local API providers call a local HTTP or WebSocket service.

Expected local API providers include:

- `index-tts-vllm`
- `lm-studio`
- `ollama`
- `player2-speech`
- `voicevox`

A local API provider can run in Node.js and Browser when it uses a compatible transport.

Browser tests must account for CORS and local network access.

CORS is a deployment constraint, not a Vue or persistence dependency.

The test suite must use a fake transport for deterministic provider contract tests.

The suite can use a live local service in a separate opt-in test.

### 6.3 Local run

Local run providers execute in the current runtime.

Expected local run providers include:

- `browser-web-speech-api`
- `kokoro-local`
- `local-audio`
- `apple-speech`
- `speech-noop`

`browser-web-speech-api` is Browser-only because Node.js does not provide Web Speech recognition.

`kokoro-local` is Browser-oriented because it uses WebGPU and a Worker-based inference adapter.

`local-audio` contains Browser and Electron local implementations.

`apple-speech` uses a native Electron implementation.

`speech-noop` has no external runtime requirement.

The classification does not mean that every local run provider enters the portable package.

Each implementation must pass the dependency and runtime audit before it moves.

## 7. Folder Layout

Phase 1 uses `cloud` and `local` as the top-level provider folders.

This layout is a Phase 1 decision.

### 7.1 Cloud and local folders

```text
src/providers/
  cloud/
  local/
```

The `cloud` folder contains cloud API providers.

The `local` folder contains local API and local run providers.

Local API and local run providers can share the `local` folder.

The provider classification and test matrix must keep these two local categories distinct.

Providers with configurable endpoints use their primary provider behavior for folder placement.

For example, `openai-compatible` can call a cloud or local endpoint.

Its folder path does not define the configured endpoint.

Do not create `local-api` or `local-run` subfolders during Phase 1.

Add more folders only in a later architecture-reviewed change.

### 7.2 Layout rules

The implementation must follow these rules:

- The registry imports definitions without hidden side effects.
- Browser-only definitions load without breaking Node.js imports.
- The test matrix maps to each provider category.

The folder name is an organization aid.

The folder name is not a runtime capability contract.

The provider definition must not gain a `kind` or `category` field only to support a folder layout.

If a machine-readable category is required later, add an optional field in a separate architecture-reviewed change.

## 8. Runtime Compatibility Verification

The leader's statement is directionally correct for most cloud API and local API providers.

The statement is not correct for every current provider.

The source audit found these groups:

- Most HTTP providers use `@xsai`, `fetch`, `URL`, `Response`, or `ReadableStream`.
- Most HTTP providers have no Vue or Pinia runtime import.
- Browser Web Speech requires a Browser capability.
- Kokoro local requires WebGPU and a Worker-based inference adapter.
- Apple Speech requires Electron IPC and a native plugin.
- Official providers require Vue, Pinia, authentication, and stage-ui server state.
- Aliyun NLS creates a WebSocket and needs a Node transport decision.
- Mimo audio uses `FileReader` and needs a small file-reading change for Node.js.
- Several definitions use a type-only vue-i18n import.

The final runtime result must come from tests, not from the source classification alone.

### 8.1 Node.js test requirements

Run every moved provider definition in a Node.js Vitest project.

The Node.js project must use no Browser environment.

The Node.js project must not define `window`, `document`, `navigator`, `localStorage`, `indexedDB`, or `Worker`.

For a dual-runtime provider, test configuration, provider creation, validators, and provider request behavior.

For a Browser-only provider, test import safety and `isAvailableBy` in Node.js.

For an Electron-only provider, keep the provider outside the portable package.

### 8.2 Browser test requirements

Run every moved provider definition in a Vitest Browser project.

Use the repository Playwright Browser provider.

For a dual-runtime provider, test the same public behavior as the Node.js test.

For a Browser-only provider, test the Browser capability and provider execution.

For Browser APIs that do not exist in headless Chromium, use an explicit fake.

Do not use Browser persistence to prepare a unit test.

### 8.3 Runtime result categories

Each provider test report must use one of these results:

- `node-and-browser`: provider execution passes in both runtimes.
- `browser-only`: provider loads in Node.js and executes in Browser.
- `node-only`: provider loads in Browser and executes in Node.js.
- `runtime-excluded`: provider remains outside the package because it needs Electron, Vue, Pinia, or persistence.

Phase 1 accepts `browser-only` for providers such as Web Speech.

Phase 1 expects `node-and-browser` for the HTTP cloud API and local API candidates.

## 9. Minimal Provider Definition Changes

The current provider definition remains the primary interface.

Phase 1 keeps these fields and behaviors:

- `id`
- `name`
- `description`
- `nameLocalize`
- `descriptionLocalize`
- `tasks`
- `createProviderConfig`
- `createProvider`
- `extraMethods`
- `validationRequiredWhen`
- `validators`
- `capabilities`
- `requiresCredentials`
- `configuredBy`
- `business`

The following changes are required:

1. Replace `ComposerTranslation` with a plain translator function type.
2. Keep the existing `{ t }` context shape for provider definitions.
3. Move the Vue `views` field to a stage-ui view registry.
4. Keep `isAvailableBy` as the existing runtime availability hook.
5. Keep Browser capability checks inside `isAvailableBy` or provider execution.

The translator change removes the vue-i18n type dependency.

The view change removes the Vue component dependency.

The existing provider creation, validation, capability, and extra method contracts stay unchanged.

Phase 1 does not add a provider category field.

Phase 1 does not add a dependency container to every provider definition.

An adapter is added only when a provider cannot run in both target runtimes without one.

### 9.1 Mimo audio change

`providers/mimo-audio/index.ts` uses `FileReader` for transcription input.

Replace that helper with `Blob.arrayBuffer()` and a cross-runtime base64 conversion.

This change removes a Node.js execution failure.

It does not change the provider definition shape.

### 9.2 Aliyun NLS change

`providers/aliyun-nls/provider.ts` creates a global WebSocket.

Browser WebSocket support is available in the target Browser runtime.

Node.js needs an explicit WebSocket adapter or a Node transport.

The Phase 1 decision is pending architecture review and the Node test result.

The token and URL utility modules can move independently when their import graph stays separate.

### 9.3 Official provider change

The official provider definitions remain in stage-ui during Phase 1.

The definitions use Vue state and Pinia chat session state.

They also use stage-ui authentication and server configuration.

Moving them requires a reviewed application adapter.

That adapter is not part of the core provider definition redesign.

## 10. Restricted Parts

The following parts cannot enter the core package without a separate change.

### 10.1 Provider barrel

`providers/index.ts` imports every provider for side effects.

It currently loads Vue, Electron, local inference, and Browser runtime modules together.

Split it into a portable or approved-runtime barrel and a stage-ui runtime barrel.

The root package entry point must not load excluded providers.

### 10.2 Vue and Pinia dependencies

The following files contain forbidden Vue or Pinia dependencies:

- `providers/official/index.ts`
- `providers/official/shared.ts`
- `providers/apple-speech/hearing-settings.vue`
- `providers/provider-definitions.test.ts`
- `providers/voicevox/define.test.ts`
- `providers/elevenlabs/index.ts`, through type-only vue-i18n usage
- `providers/openai-audio/index.ts`, through type-only vue-i18n usage
- `providers/unspeech/index.ts`, through type-only vue-i18n usage
- `providers/local-audio/index.ts`, through type-only vue-i18n usage

The type-only imports require replacement with the core translator type.

The runtime Vue and Pinia imports require stage-ui ownership or a reviewed adapter.

### 10.3 Browser persistence

Provider definitions must not import provider stores or persistence helpers.

`packages/stage-ui/src/stores/providers/config.ts` remains in stage-ui.

It owns Pinia state and `useLocalStorage` persistence.

The provider package receives the resulting configuration as input.

The existing `packages/testing-audio` setup also uses `localStorage` for application preparation.

That usage is valid in the integration harness but forbidden in the provider package.

### 10.4 Apple Speech

The following files remain in stage-ui:

- `providers/apple-speech/index.ts`
- `providers/apple-speech/provider.ts`
- `providers/apple-speech/hearing-settings.vue`
- `providers/apple-speech/index.test.ts`

The provider uses Electron renderer IPC and the Apple Speech Electron plugin.

It accesses `window.electron.ipcRenderer` and native platform state.

The view uses Vue and VueUse.

This provider is an Electron local-run provider, not a Web and Node provider.

### 10.5 Browser Web Speech

`providers/browser-web-speech-api` can enter the package after the type graph is clean.

Browser API use is allowed for this provider.

The provider uses `window.SpeechRecognition` and Browser media behavior.

Node.js does not provide Speech Recognition.

The Node test must load the definition and report unavailable support.

The Browser test must use a real or explicit fake Speech Recognition implementation.

This provider is `browser-only`, not `runtime-excluded`.

### 10.6 Kokoro local provider

`providers/kokoro-local/index.ts` needs review before it moves.

It uses `navigator.gpu` and stage-shared WebGPU state.

It calls the stage-ui inference adapter.

That adapter uses a Worker and local model runtime behavior.

Browser API use is allowed, but the stage-ui inference import is not a core package dependency.

The provider can move after the local inference capability has a package-owned or injected adapter.

### 10.7 Local audio providers

`providers/local-audio/index.ts` needs review before it moves.

It contains Browser and Electron local implementations.

It uses device memory and WebGPU checks.

It uses stage-shared platform detection and local audio runtime modules.

Its Browser branch can enter a later package revision after the runtime adapter is isolated.

Its Electron branch remains in stage-ui.

### 10.8 Mimo audio provider

`providers/mimo-audio/index.ts` can enter the cloud API group after the `FileReader` helper changes.

The current helper is not available in Node.js.

The required change is local to audio input conversion.

The provider definition interface does not need to change.

### 10.9 Aliyun NLS provider

The following files need a Node transport decision:

- `providers/aliyun-nls/provider.ts`
- `providers/aliyun-nls/session.ts`
- `providers/aliyun-nls/provider.test.ts`

The provider creates and manages WebSocket connections.

Browser WebSocket is allowed.

Node.js requires an injected adapter or a compatible Node implementation.

Keep the provider outside the `node-and-browser` set until the adapter test passes.

The following files can move as utility modules when their import graph stays independent:

- `providers/aliyun-nls/token.ts`
- `providers/aliyun-nls/token.test.ts`
- `providers/aliyun-nls/utils.ts`

### 10.10 NVIDIA availability dependency

`providers/nvidia/index.ts` uses the stage-shared `isStageTamagotchi` helper.

That helper reads Vite environment state.

The new package cannot depend on application build environment state for Node.js execution.

Move the availability decision to stage-ui or replace it with a reviewed runtime-neutral hook.

The HTTP provider implementation itself remains a cloud API candidate.

### 10.11 UI metadata

The following files remain in stage-ui:

- `packages/stage-ui/src/libs/providers/metadata.ts`
- `packages/stage-ui/src/libs/providers/hearing-view.ts`

The metadata module uses Vue i18n and stage-ui schema helpers.

The hearing view module uses Vue injection and computed references.

These modules render or prepare UI behavior.

They do not belong in the provider core.

## 11. ASR Acceptance Feasibility

Using `@proj-airi/vitest-plugin-fakemic` for ASR acceptance is feasible.

The plugin starts a Playwright Web or Electron runtime.

It gives Chromium a file-backed fake microphone input.

It can therefore test the real audio path from microphone input to ASR output.

The plugin does not replace provider unit tests.

It does not directly test an isolated provider function.

### 11.1 Test ownership

Keep full audio pipeline acceptance in `@proj-airi/testing-audio`.

That package already owns runtime startup, routes, selectors, application preparation, and audio observations.

Update its provider setup to import definitions from `@proj-airi/provider-inference` after the extraction.

Do not add `@proj-airi/testing-audio` as a dependency of the provider package.

The provider package can use `@proj-airi/vitest-plugin-fakemic` as a development dependency only if it later owns a package-specific runtime harness.

### 11.2 Audio fixtures

The existing `testing-audio` package contains these usable WAV fixtures:

- `cases/long-leading-silence/input.test.wav`
- `cases/single-utterance-pipeline/input.test.wav`
- `cases/two-utterance-streaming/input.test.wav`

Copy the required WAV files into package-owned test fixtures when a package-local acceptance suite needs them.

Copy the files without copying the `testing-audio` application harness.

Record the source path and fixture purpose in the package test documentation.

The current fixtures cover leading silence, one utterance, and streaming multiple utterances.

### 11.3 ASR test layers

Use three test layers:

1. Node.js provider tests for request construction, response parsing, errors, and stream handling.
2. Browser provider tests for Browser APIs and Browser runtime behavior.
3. Fakemic pipeline acceptance for real microphone, VAD, ASR, and UI integration.

Use `*.audio.test.ts` for cases that run in both configured audio runtimes.

Use `*.audio.web.test.ts` for Browser-only cases.

Use `*.audio.electron.test.ts` only for Electron native cases.

Do not use `@proj-airi/testing-audio` persistence setup in Node.js provider tests.

## 12. Test Plan

### 12.1 Registry tests

Test provider registration.

Test lookup by provider identifier.

Test deterministic provider listing.

Test that the core entry point does not register excluded Electron or Vue providers.

Test Browser-only definitions through the core registry without Browser globals in Node.js.

### 12.2 Provider tests

Test configuration creation for each moved provider.

Test configuration validation.

Test runtime validation with deterministic transports.

Test provider instance creation.

Test declared chat, transcription, and speech capabilities.

Test model and voice discovery where the provider defines those methods.

Use explicit fetch fakes for HTTP providers.

Use explicit Browser capability fakes for Browser-only providers.

Use an explicit WebSocket adapter for Aliyun NLS if it enters the package.

### 12.3 Cross-runtime matrix

Run Node.js and Browser projects for every moved provider.

Record one runtime result for every provider.

Require `node-and-browser` for cloud API and local API candidates unless the provider has a documented runtime exception.

Require `browser-only` for Browser-specific local-run providers.

Keep Electron-only providers outside the portable package.

### 12.4 Import audit

Scan source imports and declaration output for forbidden packages.

Scan source code for Browser persistence APIs.

The audit must reject:

- `vue`
- `vue-i18n`
- `pinia`
- `pinia-plugin-synced`
- `localStorage`
- `indexedDB`
- `caches`
- `document.cookie`
- `@proj-airi/stage-ui`
- Stage-ui stores and persistence modules

The audit must allow approved Browser APIs.

The audit must also report Browser-only APIs so that the runtime test matrix includes them.

### 12.5 Workspace checks

Run the provider package typecheck.

Run the provider package Node.js tests.

Run the provider package Browser tests.

Run the ASR acceptance project with `@proj-airi/vitest-plugin-fakemic`.

Run the stage-ui typecheck.

Run the repository typecheck.

Run the repository lint command.

## 13. Migration Rules

The implementation must follow these rules:

1. Move the core provider contract before moving provider definitions.
2. Replace Vue i18n types with the runtime-neutral translator type.
3. Keep the `{ t }` context shape to reduce provider changes.
4. Move Vue views to a stage-ui view registry.
5. Split the side-effect barrel into approved and runtime-specific barrels.
6. Move cloud API and local API candidates after the runtime audit.
7. Move Browser-only providers only when Node.js import safety passes.
8. Keep Electron providers in stage-ui.
9. Keep Pinia and persistence in stage-ui.
10. Update stage-ui imports in one migration.
11. Remove old provider imports after the migration.
12. Do not add a provider category field only for folder organization.
13. Do not hide a forbidden dependency behind a runtime check.

The provider package owns provider definitions and their registry.

Stage-ui owns UI, persistence, authentication, platform assembly, and Electron integration.

## 14. Acceptance Criteria

Phase 1 is complete when all conditions pass:

- `packages/provider-inference` exists as a workspace package.
- The package root loads in Node.js without Browser globals.
- The package root loads in a Browser test project.
- The package has no Vue, Vue Pinia, or Browser persistence dependency.
- Browser-specific providers use guarded runtime access.
- Every moved provider has a Node.js and Browser test result.
- Cloud API and local API candidates pass both runtime tests, or have a documented exception.
- Browser-only local-run providers pass Browser behavior tests and Node.js import tests.
- Electron-only providers remain in stage-ui.
- `vitest-plugin-fakemic` validates the ASR pipeline.
- The ASR acceptance suite uses a fixture from the existing audio test set or a documented copy.
- The provider definition design changes only for Vue removal, view ownership, or a required runtime adapter.
- Stage-ui uses the new provider core interface.
- `inference-service-providers.ts` remains a stage-ui configuration service.
- Typecheck and lint pass for the repository.

## 15. Later Phases

Later phases can address:

- Additional provider subfolders after an architecture review.
- A Node WebSocket adapter for Aliyun NLS.
- An injected local inference adapter for Kokoro.
- A split Browser and Electron implementation for local audio.
- A native speech adapter for Apple Speech.
- A reviewed application adapter for official providers.
- A separate provider configuration package for remote CRUD.
- Public package release and external package documentation.

These changes require new interfaces or runtime adapters.

They do not change the Phase 1 provider contract without architecture review.

## 16. Fixed Decisions

The following decisions are fixed for Phase 1:

- The extraction source is `packages/stage-ui/src/libs/providers/providers`.
- The top-level provider folders are `cloud` and `local`.
- `local-api` and `local-run` share the `local` folder during Phase 1.
- Vue, Vue Pinia, and Browser persistence remain forbidden.
- Browser-specific APIs are allowed.
- `inference-service-providers.ts` does not move.
- Provider definitions keep their current shape as far as possible.
- Node.js and Browser tests both run for moved providers.
- `vitest-plugin-fakemic` validates ASR pipeline behavior.
- `testing-audio` WAV fixtures can be copied for package-owned acceptance tests.
- `testing-audio` application setup does not become a core package dependency.
