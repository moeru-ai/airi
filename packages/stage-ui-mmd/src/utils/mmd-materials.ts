import type { MMDToonMaterial } from '@moeru/three-mmd/materials/toon'
import type { BufferGeometry, Material, Object3D } from 'three'

import { Mesh } from 'three'

interface OriginalSurfaceState {
  opacity: number
  transparent: boolean
}

const originalSurfaceStates = new WeakMap<MMDToonMaterial, OriginalSurfaceState>()

function isMMDMaterial(material: Material): material is MMDToonMaterial {
  return 'isMMDMaterial' in material && material.isMMDMaterial === true
}

function forEachMMDMaterial(root: Object3D, visit: (material: MMDToonMaterial) => void): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh))
      return

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (isMMDMaterial(material))
        visit(material)
    }
  })
}

/**
 * Applies AIRI's albedo-glow policy to loader-owned MMD surfaces.
 *
 * Generated outline and shadow-pass materials remain under three-mmd's
 * control, while all render meshes opt out of bind-pose frustum culling.
 */
export function prepareMMDMaterials(root: Object3D, glow = 0.45): void {
  root.traverse((object) => {
    if (object instanceof Mesh)
      object.frustumCulled = false
  })

  forEachMMDMaterial(root, (material) => {
    if (material.map) {
      material.emissiveMap = material.map
      material.emissive.setScalar(1)
    }
    else {
      material.emissiveMap = null
      material.emissive.copy(material.color)
    }

    material.emissiveIntensity = glow
    material.needsUpdate = true
  })
}

/** Updates AIRI's live albedo-glow setting without modifying outline passes. */
export function setMMDMaterialGlow(root: Object3D, glow: number): void {
  forEachMMDMaterial(root, (material) => {
    material.emissiveIntensity = glow
  })
}

/** Returns user-configurable surface materials in loader traversal order. */
export function collectMMDMaterials(root: Object3D): { name: string, label: string, index: number }[] {
  const descriptors: { name: string, label: string, index: number }[] = []
  forEachMMDMaterial(root, (material) => {
    const index = descriptors.length
    descriptors.push({
      name: material.name,
      label: material.name || `Material ${index}`,
      index,
    })
  })
  return descriptors
}

/**
 * Applies named opacity overrides to MMD surfaces.
 *
 * Removing an override restores the authored opacity and transparency instead
 * of forcing an opaque default. Outline alpha remains owned by three-mmd.
 */
export function applyMMDMaterialOpacity(root: Object3D, overrides: Record<string, number>): void {
  forEachMMDMaterial(root, (material) => {
    let original = originalSurfaceStates.get(material)
    if (!original) {
      original = {
        opacity: material.opacity,
        transparent: material.transparent,
      }
      originalSurfaceStates.set(material, original)
    }

    const override = overrides[material.name]
    material.opacity = override ?? original.opacity
    material.transparent = override === undefined
      ? original.transparent
      : original.transparent || override < 1
    material.needsUpdate = true
  })
}

/**
 * Releases GPU resources owned by an MMD object tree exactly once.
 *
 * three-mmd outline meshes can share geometry with their surface, while SDEF
 * depth and distance materials live outside `Mesh.material`; both cases are
 * accounted for explicitly.
 */
export function disposeMMDObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()

  root.traverse((object) => {
    if (!(object instanceof Mesh))
      return

    geometries.add(object.geometry)
    const renderMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of renderMaterials)
      materials.add(material)

    if (object.customDepthMaterial)
      materials.add(object.customDepthMaterial)
    if (object.customDistanceMaterial)
      materials.add(object.customDistanceMaterial)
  })

  for (const geometry of geometries)
    geometry.dispose()
  for (const material of materials)
    material.dispose()
}
