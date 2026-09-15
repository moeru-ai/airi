import type { ManifestEntry } from '../types'

/**
 * Creates a stable activation order for discovered Extension manifests.
 *
 * Required Kit Providers precede their Consumers, including transitive chains.
 * Optional Kit declarations do not delay activation. Cyclic candidates retain
 * discovery order and let the Host report their unavailable required Kits.
 */
export function createExtensionActivationPlan(entries: ManifestEntry[]): ManifestEntry[] {
  const providersByKitId = new Map<string, Array<{ entry: ManifestEntry, version: string }>>()
  for (const entry of entries) {
    for (const declaration of entry.manifest.kits?.provides ?? []) {
      const providers = providersByKitId.get(declaration.id) ?? []
      providers.push({ entry, version: declaration.version })
      providersByKitId.set(declaration.id, providers)
    }
  }

  const dependencies = new Map<ManifestEntry, Set<ManifestEntry>>()
  for (const entry of entries) {
    const requiredProviders = new Set<ManifestEntry>()
    for (const declaration of entry.manifest.kits?.uses ?? []) {
      if (declaration.optional) {
        continue
      }

      for (const provider of providersByKitId.get(declaration.id) ?? []) {
        if (provider.entry !== entry && provider.version === declaration.version) {
          requiredProviders.add(provider.entry)
        }
      }
    }
    dependencies.set(entry, requiredProviders)
  }

  const planned: ManifestEntry[] = []
  const scheduled = new Set<ManifestEntry>()
  let pending = [...entries]
  while (pending.length > 0) {
    const ready = pending.filter(entry => [...(dependencies.get(entry) ?? [])].every(provider => scheduled.has(provider)))
    if (ready.length === 0) {
      planned.push(...pending)
      break
    }

    planned.push(...ready)
    ready.forEach(entry => scheduled.add(entry))
    const readySet = new Set(ready)
    pending = pending.filter(entry => !readySet.has(entry))
  }

  return planned
}
