import type { ProviderDefinition } from '../types'

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
  return definition
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
