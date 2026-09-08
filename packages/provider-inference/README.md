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

`resolveGeneration(provider, model, options)` returns a discriminated request with one protocol and its configuration. Native providers implement `generation`; existing Chat providers enter through this resolver. Catalog capabilities declare supported protocols, their default, and native tools. `core-agent` projects its context directly into the selected protocol and owns streaming, tools, and history. The validation probe uses the selected protocol.

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

OpenAI model discovery uses LobeHub's [`model-bank`](https://github.com/lobehub/lobehub/tree/canary/packages/model-bank) for exact-ID metadata.
Provider-specific imports avoid loading unrelated catalogs. Upgrade the pinned dependency to refresh this data.
OpenRouter discovery uses its [Models API](https://openrouter.ai/docs/guides/overview/models).
The endpoint model list remains authoritative. Catalog entries cannot add models unavailable through that endpoint.
Custom endpoints receive no metadata from official routes.

`ModelInfo.metadata` discriminates model-bank data from OpenRouter data.
Model-bank abilities, settings, and pricing use its exported `AIChatModelCard` contract.
Currency and fixed, tiered, or lookup pricing remain intact. OpenRouter prices use USD per million tokens.
Catalog prices are advisory data, not Flux billing quotes.
Neither tool calling nor OpenRouter search parameters imply native search on another route.
Protocol defaults and native tool declarations remain provider-owned policy.

OpenAI metadata requires no catalog request. OpenRouter public snapshots use no credentials and expire after one hour. Concurrent discovery shares the same snapshot request.
Generation does not fetch catalogs. Failed metadata requests preserve endpoint models and return `metadataError`.
