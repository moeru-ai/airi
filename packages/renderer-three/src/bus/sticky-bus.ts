// Sticky bus for downwards(command from stage-ui) & upwards(emit to stage-ui) info flow
//
// Type of un-subscription function
export type Unsub = () => void

export function createStickyBus<T extends Record<string, any>>() {
  // Map of all subscribers <key, handler()>
  const map = new Map<keyof T, Set<(p: any) => void>>()
  // store the last emitted value
  const last = new Map<keyof T, any>()

  function on<K extends keyof T>(
    key: K,
    handler: (p: T[K]) => void,
    opts?: { immediate?: boolean },
  ): Unsub {
    // If new subscriber, create new set
    if (!map.has(key)) {
      map.set(key, new Set())
    }
    // Add new handler to the existed subscriber
    map.get(key)!.add(handler as any)
    // If needed, run the handler immediately to obtain the last emitted value
    if (opts?.immediate && last.has(key)) {
      handler(last.get(key))
    }
    // return the un-subscription function
    return () => map.get(key)?.delete(handler as any)
  }

  // execute handler according to the subscriber
  function emit<K extends keyof T>(key: K, payload: T[K]) {
    // Save the newest emitted value
    last.set(key, payload)
    // run handler
    map.get(key)?.forEach(fn => fn(payload))
  }

  return { on, emit }
}
