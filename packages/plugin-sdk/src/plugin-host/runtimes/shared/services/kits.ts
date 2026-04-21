import type { KitDescriptor } from '../../../shared/kits'
import type { PluginRuntime } from '../../../shared/types'

function normalizeKitDescriptor(kit: KitDescriptor) {
  return {
    kitId: kit.kitId,
    version: kit.version,
    runtimes: [...new Set(kit.runtimes)].sort(),
    capabilities: kit.capabilities
      .map(capability => ({
        key: capability.key,
        actions: [...new Set(capability.actions)].sort(),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  }
}

function isSemanticallyEqualKitDescriptor(left: KitDescriptor, right: KitDescriptor) {
  return JSON.stringify(normalizeKitDescriptor(left)) === JSON.stringify(normalizeKitDescriptor(right))
}

function createKitCollisionError(kitId: string) {
  return new Error(`Duplicate kit registration for \`${kitId}\` conflicts with an existing descriptor.`)
}

/**
 * Stores host-registered kit descriptors and exposes runtime-filtered lookups.
 *
 * Use when:
 * - The host needs to register, read, and remove kit contracts
 * - Plugin-facing kit APIs need runtime-compatible descriptor snapshots
 *
 * Expects:
 * - `kitId` is unique unless the descriptor is semantically identical
 *
 * Returns:
 * - An in-memory kit registry with duplicate collision detection
 */
export class KitRegistryService<TKit extends KitDescriptor = KitDescriptor> {
  private readonly kits = new Map<string, TKit>()

  register(kit: TKit) {
    const current = this.kits.get(kit.kitId)
    if (!current) {
      this.kits.set(kit.kitId, kit)
      return kit
    }

    if (!isSemanticallyEqualKitDescriptor(current, kit)) {
      throw createKitCollisionError(kit.kitId)
    }

    return current
  }

  get(kitId: string) {
    return this.kits.get(kitId)
  }

  has(kitId: string) {
    return this.kits.has(kitId)
  }

  remove(kitId: string) {
    const kit = this.kits.get(kitId)
    if (!kit) {
      return undefined
    }

    this.kits.delete(kitId)
    return kit
  }

  list() {
    return [...this.kits.values()]
  }

  listByRuntime(runtime: PluginRuntime) {
    return this.list().filter(kit => kit.runtimes.includes(runtime))
  }
}
