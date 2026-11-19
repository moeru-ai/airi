import type { MMDMaterialDescriptor } from '@moeru/three-mmd/materials'

import { MMDToonMaterial } from '@moeru/three-mmd/materials/toon'
import {
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshPhongMaterial,
  Texture,
} from 'three'
import { describe, expect, it } from 'vitest'

import {
  applyMMDMaterialOpacity,
  collectMMDMaterials,
  disposeMMDObject,
  prepareMMDMaterials,
  setMMDMaterialGlow,
} from './mmd-materials'

function createDescriptor(name: string, opacity = 1): MMDMaterialDescriptor {
  return {
    ambient: new Color(0.1, 0.2, 0.3),
    diffuse: new Color(0.4, 0.5, 0.6),
    doubleSided: false,
    fog: true,
    isDefaultToonTexture: true,
    name,
    opacity,
    outline: {
      alpha: 0.35,
      color: new Color(0.1, 0.1, 0.1),
      visible: true,
      width: 0.01,
    },
    shininess: 16,
    specular: new Color(0.2, 0.3, 0.4),
    toonMap: new Texture(),
    toonMapFileName: 'toon01.bmp',
  }
}

function countDisposals(resource: BufferGeometry | MeshBasicMaterial | MeshDepthMaterial | MeshDistanceMaterial | MMDToonMaterial) {
  let count = 0
  resource.addEventListener('dispose', () => count++)
  return () => count
}

describe('mmd surface materials', () => {
  it('keeps generated outline materials out of the settings catalog and live controls', () => {
    const root = new Group()
    const surface = new MMDToonMaterial(createDescriptor('skin', 0.8))
    const outline = new MeshPhongMaterial({ opacity: 0.35, transparent: true })
    outline.name = 'skin:outline'
    const mesh = new Mesh(new BufferGeometry(), surface)
    mesh.add(new Mesh(mesh.geometry, outline))
    root.add(mesh)

    prepareMMDMaterials(root)
    setMMDMaterialGlow(root, 0.7)
    applyMMDMaterialOpacity(root, { 'skin': 0.4, 'skin:outline': 0.1 })

    expect(collectMMDMaterials(root)).toEqual([
      { index: 0, label: 'skin', name: 'skin' },
    ])
    expect(surface.emissiveIntensity).toBe(0.7)
    expect(surface.opacity).toBe(0.4)
    expect(surface.transparent).toBe(true)
    expect(outline.emissiveIntensity).toBe(1)
    expect(outline.opacity).toBe(0.35)
  })

  it('restores each surface material authored opacity and transparency', () => {
    const surface = new MMDToonMaterial(createDescriptor('glass', 0.6))
    const root = new Mesh(new BufferGeometry(), surface)

    applyMMDMaterialOpacity(root, { glass: 0.2 })
    applyMMDMaterialOpacity(root, {})

    expect(surface.opacity).toBe(0.6)
    expect(surface.transparent).toBe(true)
  })
})

describe('mmd GPU resource disposal', () => {
  it('disposes shared geometry, render materials, and custom shadow materials once', () => {
    const geometry = new BufferGeometry()
    const surface = new MMDToonMaterial(createDescriptor('surface'))
    const outline = new MeshBasicMaterial()
    const depth = new MeshDepthMaterial()
    const distance = new MeshDistanceMaterial()
    const mesh = new Mesh(geometry, surface)
    mesh.customDepthMaterial = depth
    mesh.customDistanceMaterial = distance
    mesh.add(new Mesh(geometry, outline))

    const geometryDisposals = countDisposals(geometry)
    const surfaceDisposals = countDisposals(surface)
    const outlineDisposals = countDisposals(outline)
    const depthDisposals = countDisposals(depth)
    const distanceDisposals = countDisposals(distance)

    disposeMMDObject(mesh)

    expect(geometryDisposals()).toBe(1)
    expect(surfaceDisposals()).toBe(1)
    expect(outlineDisposals()).toBe(1)
    expect(depthDisposals()).toBe(1)
    expect(distanceDisposals()).toBe(1)
  })
})
