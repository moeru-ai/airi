import type { ProviderDefinition, ProviderInstance } from '../types'

/**
 * A read-only lookup surface for provider definitions.
 *
 * The caller supplies the definitions. Importing a provider module does not
 * change a shared registry.
 */
export interface ProviderRegistry {
  get: (id: string) => ProviderDefinition | undefined
  list: () => ProviderDefinition[]
}

/**
 * Keeps the existing declaration style while making provider modules pure.
 *
 * The application registry receives the returned definitions explicitly.
 */
export function defineProvider<TConfig, const TId extends string = string>(
  definition: ProviderDefinition<TConfig, TId>,
): ProviderDefinition<TConfig, TId> {
  return {
    ...definition,
    createProvider(config, context) {
      const result = definition.createProvider(config, context)
      if (!context?.fetch || definition.usesHTTP === false)
        return result
      function bind(provider: ProviderInstance): ProviderInstance {
      // SDK configurations without a custom adapter use the captured HTTP transport.
      // Custom adapters own their final network call and receive the same context above.
        return new Proxy(provider, {
          get(target, property, receiver) {
            const value: unknown = Reflect.get(target, property, receiver)
            if (typeof value !== 'function' || !['chat', 'generation', 'model', 'speech', 'transcription', 'embed'].includes(String(property)))
              return value
            return (...args: unknown[]) => {
              const result = Reflect.apply(value, target, args) as Record<string, unknown>
              if (property === 'generation') {
                const config = result.config as { fetch?: typeof globalThis.fetch }
                return { ...result, config: { ...config, fetch: config.fetch ?? context?.fetch } }
              }
              return { ...result, fetch: result.fetch ?? context?.fetch }
            }
          },
        })
      }
      return result instanceof Promise ? result.then(bind) : bind(result)
    },
  }
}

/**
 * Creates a deterministic provider registry from explicit definitions.
 *
 * @throws {Error} When more than one definition declares the same id.
 */
export function createProviderRegistry(definitions: readonly ProviderDefinition[]): ProviderRegistry {
  const definitionsById = new Map<string, ProviderDefinition>()

  for (const definition of definitions) {
    if (definitionsById.has(definition.id))
      throw new Error(`Provider definition "${definition.id}" is registered more than once.`)

    definitionsById.set(definition.id, definition)
  }

  const sortedDefinitions = [...definitionsById.values()].toSorted((left, right) => {
    if (left.order === undefined && right.order !== undefined)
      return 1
    if (left.order !== undefined && right.order === undefined)
      return -1
    if (left.order !== undefined && right.order !== undefined && left.order !== right.order)
      return left.order - right.order
    if (left.name < right.name)
      return -1
    if (left.name > right.name)
      return 1
    return 0
  })

  return {
    get: id => definitionsById.get(id),
    list: () => [...sortedDefinitions],
  }
}
