/**
 * Serialize concurrent async initialization while still allowing later retries
 * when setup returns `null` or throws before producing a usable singleton.
 */
export function createSerializedOptionalInitializer<T>(factory: () => Promise<T | null>) {
  let resolved: T | null = null
  let hasResolved = false
  let pending: Promise<T | null> | null = null

  return async function ensure(): Promise<T | null> {
    if (hasResolved)
      return resolved

    if (pending)
      return pending

    pending = (async () => {
      const result = await factory()
      if (result !== null) {
        resolved = result
        hasResolved = true
      }
      return result
    })()

    try {
      return await pending
    }
    finally {
      pending = null
    }
  }
}
