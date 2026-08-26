import type { KitDescriptor } from '../../../shared/kits'
import type { PluginRuntime } from '../../../shared/types'

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

  get(kitId: string) {
    return this.kits.get(kitId)
  }

  has(kitId: string) {
    return this.kits.has(kitId)
  }

  list() {
    return [...this.kits.values()]
  }

  listByRuntime(runtime: PluginRuntime) {
    return this.list().filter(kit => kit.runtimes.includes(runtime))
  }

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

  remove(kitId: string) {
    const kit = this.kits.get(kitId)
    if (!kit) {
      return undefined
    }

    this.kits.delete(kitId)
    return kit
  }
}

function createKitCollisionError(kitId: string) {
  return new Error(`Duplicate kit registration for \`${kitId}\` conflicts with an existing descriptor.`)
}

function isSemanticallyEqualKitDescriptor(left: KitDescriptor, right: KitDescriptor) {
  return JSON.stringify(normalizeKitDescriptor(left)) === JSON.stringify(normalizeKitDescriptor(right))
}

function normalizeKitDescriptor(kit: KitDescriptor) {
  return {
    capabilities: kit.capabilities
      .map(capability => ({
        actions: [...new Set(capability.actions)].sort(),
        key: capability.key,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    kitId: kit.kitId,
    runtimes: [...new Set(kit.runtimes)].sort(),
    version: kit.version,
  }
}
