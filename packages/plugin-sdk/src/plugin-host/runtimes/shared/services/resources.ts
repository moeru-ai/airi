export type ResourceResolver<T> = () => Promise<T> | T

/**
 * Stores resources either as eager values or lazy resolver functions.
 *
 * Lookup order is:
 * 1. resolver registered with `setResolver`
 * 2. value registered with `setValue`
 * 3. optional fallback passed to `get`
 *
 * Example:
 * ```ts
 * const service = new ResourceService()
 * service.setValue('resource:locale', 'en-US')
 * service.setResolver('resource:theme', async () => 'dark')
 *
 * await service.get('resource:locale') // 'en-US'
 * await service.get('resource:theme') // 'dark'
 * await service.get('resource:missing', 'fallback') // 'fallback'
 * ```
 */
export class ResourceService {
  private readonly resolvers = new Map<string, ResourceResolver<unknown>>()
  private readonly values = new Map<string, unknown>()

  /**
   * Registers a lazy resource provider for `key`.
   *
   * The resolver is called every time `get(key)` is executed, and its result
   * takes precedence over any value previously stored with `setValue(key, ...)`.
   */
  setResolver<T>(key: string, resolver: ResourceResolver<T>) {
    this.resolvers.set(key, resolver as ResourceResolver<unknown>)
  }

  /**
   * Removes the lazy resolver for `key`.
   *
   * If a value still exists for the same key, subsequent `get(key)` calls fall
   * back to that stored value.
   */
  removeResolver(key: string) {
    this.resolvers.delete(key)
  }

  /**
   * Stores an eager value for `key`.
   *
   * Use this when the resource is already available and does not need to be
   * computed on demand. This value is only returned when no resolver is
   * registered for the same key.
   */
  setValue<T>(key: string, value: T) {
    this.values.set(key, value)
  }

  /**
   * Removes the stored value for `key`.
   *
   * If a resolver still exists for the same key, `get(key)` continues to
   * resolve through that resolver.
   */
  removeValue(key: string) {
    this.values.delete(key)
  }

  /**
   * Returns whether any resolver or stored value is registered for `key`.
   */
  has(key: string) {
    return this.resolvers.has(key) || this.values.has(key)
  }

  /**
   * Resolves a resource by key.
   *
   * Resolution order is resolver -> stored value -> fallback.
   * The optional fallback is only used when neither a resolver nor a stored
   * value has been registered for the key.
   */
  async get<T>(key: string, fallback?: T): Promise<T | undefined> {
    const resolver = this.resolvers.get(key)
    if (resolver) {
      return await resolver() as T
    }

    if (this.values.has(key)) {
      return this.values.get(key) as T
    }

    return fallback
  }
}
