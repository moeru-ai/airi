# Provider Inference

`@proj-airi/provider-inference` owns runtime-neutral AIRI provider definitions.

Use this package to list built-in providers, create provider configuration schemas, and create provider instances. The package runs in Node.js and Browser runtimes.

Do not use this package for provider configuration persistence, Vue views, Pinia state, authentication, or Electron-native providers. Those concerns remain in `@proj-airi/stage-ui`.

## Use

```ts
import { getDefinedProvider, listProviders } from '@proj-airi/provider-inference'

const provider = getDefinedProvider('openai')
const providers = listProviders()
```

Browser-only definitions, such as Web Speech API, load in Node.js. Their availability hook returns `false` when the required Browser capability is absent.

The root entry exports Sherpaw model presets and a definition factory. Vite plugins can use `@proj-airi/provider-inference/sherpaw-transcription/models` to load only model metadata. The presets include stable IDs, languages, recognizer types, pinned revisions, and artifact URLs. Neither entry downloads or loads model files.

`createSherpawTranscriptionDefinition` owns recognition, Worker cleanup, and the first model choice.
The host supplies exposed models, a Worker URL, a fetch function, and the current interface language.
The host also reports whether it runs on mobile. Chinese and English default to X-ASR on desktop and Paraformer on mobile.
`stage-ui` supplies these resources and adds the Hearing settings view.

Use `@proj-airi/stage-ui` for saved provider configuration, Vue settings views, Pinia state, authentication, and Electron-native providers. Do not use this package to manage those application concerns.

## Verify

Run the package checks from the workspace root:

```text
pnpm -F @proj-airi/provider-inference typecheck
pnpm -F @proj-airi/provider-inference test:node
pnpm -F @proj-airi/provider-inference test:browser
pnpm -F @proj-airi/provider-inference build
```

## Generation protocols

OpenAI and OpenAI Compatible configurations accept `api: 'chat-completions' | 'responses'`. OpenAI defaults to `responses`. OpenAI Compatible defaults to `chat-completions`. Saved protocol choices take precedence. The provider settings page renders this field as an API protocol selector.

`ProviderDefinition` owns configuration and instance creation. `getGenerationProvider(instance)` adapts SDK Chat instances at that boundary.
`GenerationProvider.generation(model, options)` selects a protocol and returns its request configuration.
Core-agent receives this single interface and projects context directly into the selected protocol.
Protocol defaults and native tools remain provider-owned policy. The validation probe uses the selected protocol.
`generationProtocolDefinitions` owns the display metadata for every protocol.
Provider schemas use `generationProtocolOptions` to keep selector labels consistent.
Adding a protocol requires a request type and a matching metadata entry. TypeScript reports an incomplete registry or provider request switch.

```ts
const definition = getDefinedProvider('openai')
const provider = await definition.createProvider({
  apiKey: 'your-key',
  api: 'responses',
})
```

User-configured providers send Responses requests directly to their configured endpoint with their own API key. They do not require AIRI backend changes or Flux billing.
The official provider defaults to Responses and lets the user select Chat Completions.

OpenAI has a `webSearch` switch, disabled by default. The selected protocol must be Responses.
Explicitly enabling search sends the hosted tool on the official OpenAI endpoint. The provider validates model support.
Custom endpoints do not inherit this tool declaration. Model names never determine search support.
Search uses the configured OpenAI key and does not require an AIRI login or Tavily key.

## Model metadata

OpenAI and OpenRouter use their provider-specific [model-bank](https://github.com/lobehub/lobehub/tree/canary/packages/model-bank) catalogs.
The endpoint model list remains authoritative for availability. Catalog data only enriches exact model IDs on the matching endpoint.
Custom endpoints receive no metadata from official routes. There is no separate online catalog request or cache.
Upgrade the pinned model-bank dependency to refresh metadata.

`ModelInfo.metadata` uses model-bank's exported `AIChatModelCard` contract for abilities, settings, and pricing.
Currency and fixed, tiered, or lookup pricing remain intact. Catalog prices are advisory data, not Flux billing quotes.
Reported search abilities do not select a native tool implementation.

OpenAI reasoning controls use the exact model entry and effort levels from the pinned catalog.
Unsupported effort values are omitted. In particular, models without a `none` effort keep their server default when reasoning is disabled.
Generation validation uses the configured model before consulting the endpoint model list.

## OpenRouter speech

The speech provider merges the dedicated speech catalog with supported chat-audio models and removes duplicate IDs.
Dedicated speech models use `/audio/speech`. The discovered output modalities and endpoint declarations determine their route.
The chat adapter supports `openai/gpt-audio` and `openai/gpt-audio-mini` when discovery confirms audio output and a chat endpoint.
Other audio models, including Lyria music models, need a separate encoding and speech contract before this adapter can support them.

Voice discovery uses the selected model's `supported_voices`.
As supported policy, the two OpenAI chat-audio models retain their 13 voices when this field is absent or null.
An explicit empty list remains empty. Dedicated speech models never inherit the OpenAI list.
For Fish models without listed voices, select the model in Settings → Modules → Speech.
Enter its voice ID in Voice Name.
The existing manual control appears when the voice catalog is empty. An empty catalog does not select a provider default.
The Speech module restores a saved custom voice after discovery confirms an empty catalog for the saved OpenRouter model.

MP3 responses retain their original bytes.
The documented HeyGen models use mono signed PCM16 LE at 44.1 kHz, and the documented Gemini models use 24 kHz.
The adapter wraps these raw samples in WAV and preserves responses that already contain a WAV file.
Unknown raw PCM encodings fail instead of receiving an assumed sample rate.
The format table follows the [OpenRouter TTS contract](https://openrouter.ai/docs/guides/overview/multimodal/tts),
[HeyGen encoding contract](https://developers.heygen.com/docs/voices/heygen-voice-speech#output-format),
and [Gemini encoding contract](https://ai.google.dev/gemini-api/docs/speech-generation#audio-output-formats).

Each provider instance owns its catalog for one API root and key. Model-list requests refresh it.
Speech segments reuse known models and refresh a missing model, including models found by a temporary dropdown discovery instance.
Each modality retains its last successful response when only that catalog fails. The adapter logs the failed query and its error.
Discovery fails when neither catalog succeeds, or partial discovery has no usable models.
Canceled discovery changes neither catalog.
The chat adapter accepts the xsAI WAV option and requires the stream's `[DONE]` marker before returning audio.
