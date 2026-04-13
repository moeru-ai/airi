# Recipes

Use this reference when the user wants code, when you are editing xsAI code, or when a prompt needs a canonical minimal example.

## General rules

- Prefer granular `@xsai/*` imports in new examples.
- Switch to the umbrella `xsai` package only when the repo already uses it or the user explicitly wants one dependency.
- Keep `baseURL` and `model` explicit.
- Include `apiKey` for hosted providers. For local or proxy endpoints, only include it if the target actually requires one.
- Preserve the repo's existing schema library instead of swapping between Zod, Valibot, ArkType, or Effect without a reason.

## Minimal text generation

```ts
import { env } from 'node:process'

import { generateText } from '@xsai/generate-text'

const { text } = await generateText({
  apiKey: env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/',
  messages: [
    {
      content: 'You are a helpful assistant.',
      role: 'system',
    },
    {
      content: 'Write one sentence about the moon.',
      role: 'user',
    },
  ],
  model: 'gpt-4o',
})
```

Use this as the default starting point for simple scripts, tests, and one-shot helpers.

## Streaming text with tools

```ts
import { env } from 'node:process'

import { streamText } from '@xsai/stream-text'
import { tool } from '@xsai/tool'

import * as v from 'valibot'

const add = await tool({
  description: 'Adds two numbers',
  execute: ({ a, b }) => (Number.parseInt(a) + Number.parseInt(b)).toString(),
  name: 'add',
  parameters: v.object({
    a: v.pipe(v.string(), v.description('First number')),
    b: v.pipe(v.string(), v.description('Second number')),
  }),
})

const { fullStream } = streamText({
  apiKey: env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/',
  maxSteps: 2,
  messages: [
    {
      content: 'You are a helpful assistant.',
      role: 'system',
    },
    {
      content: 'What is 12 plus 30? Use the add tool.',
      role: 'user',
    },
  ],
  model: 'gpt-4o',
  toolChoice: 'required',
  tools: [add],
})

const text: string[] = []

for await (const event of fullStream) {
  if (event.type === 'text-delta') {
    text.push(event.text)
  }

  if (event.type === 'tool-call' || event.type === 'tool-result') {
    console.log(event)
  }
}

console.log(text.join(''))
```

Use `textStream` for plain live text. Use `fullStream` when the caller needs tool events, reasoning deltas, or finish metadata.

## Validated structured output

Valibot examples require `@valibot/to-json-schema` in the project. If the repo already uses a different supported schema library, keep that choice.

```ts
import { env } from 'node:process'

import { generateObject } from '@xsai/generate-object'

import * as v from 'valibot'

const { object } = await generateObject({
  apiKey: env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/',
  messages: [
    {
      content: 'Extract the event information.',
      role: 'system',
    },
    {
      content: 'Alice and Bob are going to a science fair on Friday.',
      role: 'user',
    },
  ],
  model: 'gpt-4o',
  schema: v.object({
    date: v.string(),
    name: v.string(),
    participants: v.array(v.string()),
  }),
})
```

Prefer this over asking the model for free-form JSON.

## Streaming structured output

```ts
import { env } from 'node:process'

import { streamObject } from '@xsai/stream-object'

import * as v from 'valibot'

const { partialObjectStream } = await streamObject({
  apiKey: env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/',
  messages: [
    {
      content: 'Extract the event information.',
      role: 'system',
    },
    {
      content: 'Alice and Bob are going to a science fair on Friday.',
      role: 'user',
    },
  ],
  model: 'gpt-4o',
  schema: v.object({
    date: v.string(),
    name: v.string(),
    participants: v.array(v.string()),
  }),
})

for await (const partialObject of partialObjectStream) {
  console.log(partialObject)
}
```

Use object mode for partial updates and `output: 'array'` with `elementStream` when the caller needs item-by-item results.

## Embeddings

```ts
import { embed } from '@xsai/embed'

const { embedding, usage } = await embed({
  baseURL: 'http://localhost:11434/v1/',
  input: 'sunny day at the beach',
  model: 'all-minilm',
})
```

Use `embedMany` for batch inputs with the same provider and model.
