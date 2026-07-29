import type { PhysicsFactory } from '@moeru/three-mmd'

let physicsReady: Promise<PhysicsFactory> | undefined

/**
 * Lazily initializes three-mmd's Ammo adapter.
 *
 * The memoized promise gives every mounted model the same WASM runtime while
 * leaving preview generation physics-free.
 */
export function ensureAmmo(): Promise<PhysicsFactory> {
  physicsReady ??= import('@moeru/three-mmd-physics-ammo')
    .then(async ({ initAmmo, MMDAmmoPhysics }) => {
      await initAmmo()
      return MMDAmmoPhysics
    })

  return physicsReady
}
