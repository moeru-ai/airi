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

OpenAI and OpenAI Compatible configurations accept `api: 'chat-completions' | 'responses'`. The default is `chat-completions`. The provider settings page renders this field as an API protocol selector.

`GenerationProvider` describes Chat or Responses configuration capabilities. A Responses provider does not need a Chat implementation. If both methods exist, `responses(model, options)` selects Responses. These methods return request configuration. `core-agent` projects its context directly into the selected protocol and owns streaming, tools, and history. The validation probe uses the selected protocol.

```ts
const definition = getDefinedProvider('openai')
const provider = await definition.createProvider({
  apiKey: 'your-key',
  api: 'responses',
})
```

User-configured providers send Responses requests directly to their configured endpoint with their own API key. They do not require AIRI backend changes or Flux billing. The official provider continues to use Chat Completions; its Responses support is a separate gateway change.
