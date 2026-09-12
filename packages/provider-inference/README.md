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

```ts
const definition = getDefinedProvider('openai')
const provider = await definition.createProvider({
  apiKey: 'your-key',
  api: 'responses',
})
```

User-configured providers send Responses requests directly to their configured endpoint with their own API key. They do not require AIRI backend changes or Flux billing. The official provider continues to use Chat Completions; its Responses support is a separate gateway change.

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
