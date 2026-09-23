import { picklist } from 'valibot'

/** Implemented server wire protocols. Paths are relative to the provider API base URL. */
export const generationProtocols = {
  'chat-completions': { createPath: '/chat/completions' },
  'responses': { createPath: '/responses' },
} as const

/** Protocol identity shared by configuration, dispatch and observation. */
export type GenerationProtocol = keyof typeof generationProtocols

/** Rejects unknown configured protocols instead of selecting an implicit adapter. */
export const generationProtocolSchema = picklist(Object.keys(generationProtocols) as GenerationProtocol[])

/** Names the create operation identically in gateway middleware and tracing. */
export function generationOperation<Protocol extends GenerationProtocol>(protocol: Protocol): `${Protocol}.create` {
  return `${protocol}.create`
}

/** Gateway operations that generate model output. */
export type GenerationOperation = ReturnType<typeof generationOperation>
