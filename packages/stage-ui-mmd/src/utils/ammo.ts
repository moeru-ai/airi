import type Ammo from 'ammojs-typed'

/**
 * Lazily initializes the Ammo.js (Bullet) physics runtime and exposes it as
 * the global `Ammo` that three-stdlib's `MMDPhysics` expects.
 *
 * Why a global: `MMDPhysics` (a straight port of three's example) reads
 * `Ammo.btVector3`, `Ammo.btRigidBody`, etc. off the global scope rather
 * than taking the runtime as a constructor argument. We therefore have to
 * publish the resolved module on `globalThis` before constructing any
 * physics world.
 *
 * Why lazy: the Ammo WASM binary plus its JS glue is large (~1 MB+). It is
 * pulled in via dynamic `import()` so neither the glue nor the WASM lands in
 * the main bundle until the user actually mounts an MMD model.
 *
 * The promise is memoized: concurrent callers and re-mounts share a single
 * WASM instantiation.
 */
let ammoReady: Promise<typeof Ammo> | undefined

interface AmmoGlobal {
  Ammo?: typeof Ammo
}

export async function ensureAmmo(): Promise<typeof Ammo> {
  if (ammoReady)
    return ammoReady

  ammoReady = import('ammojs-typed')
    .then(module => module.default())
    .then((lib) => {
      // NOTICE:
      // MMDPhysics resolves Bullet classes from the ambient global `Ammo`.
      // Root cause: three-stdlib/animation/MMDPhysics.js does `typeof Ammo`
      // and `new Ammo.btVector3(...)` against the global scope.
      // Source: node_modules/three-stdlib/animation/MMDPhysics.js (lines 14, 98+).
      // Removal condition: three-stdlib accepts an injected Ammo instance.
      ;(globalThis as AmmoGlobal).Ammo = lib
      return lib
    })

  return ammoReady
}

/** Whether the Ammo runtime has already been published on the global scope. */
export function isAmmoReady(): boolean {
  return Boolean((globalThis as AmmoGlobal).Ammo)
}
