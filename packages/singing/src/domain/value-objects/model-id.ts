/**
 * Value object representing a model identifier.
 * Format: "<backend>:<model-name>" e.g. "melband:melband-roformer-kim-vocals"
 */
export interface ModelId {
  readonly backend: string
  readonly name: string
}

export function createModelId(backend: string, name: string): ModelId {
  return { backend, name }
}

export function parseModelId(raw: string): ModelId {
  const [backend, ...rest] = raw.split(':')
  return { backend: backend ?? '', name: rest.join(':') }
}
