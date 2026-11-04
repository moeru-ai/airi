import type { MMDMaterialDescriptor } from '@moeru/three-mmd/materials'

import { MMDToonMaterial } from '@moeru/three-mmd/materials/toon'
import { AmbientLight, Color, DataTexture, Mesh, NearestFilter, NoToneMapping, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three'
import { describe, expect, it } from 'vitest'

function solidTexture(value: number): DataTexture {
  const texture = new DataTexture(new Uint8Array([value, value, value, 255]), 1, 1)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

describe('mmd sphere shading', () => {
  // ROOT CAUSE:
  // Multiply sphere maps included diffuse lighting twice and darkened emissive glow.
  // Apply the sphere color directly for multiply mode. Keep lighting for additive mode.
  it('keeps a white multiply sphere map neutral under dim lighting', () => {
    const sphereMap = solidTexture(255)
    const toonMap = solidTexture(255)
    const descriptor: MMDMaterialDescriptor = {
      ambient: new Color(0, 0, 0),
      diffuse: new Color(0.8, 0.4, 0.2),
      doubleSided: false,
      fog: false,
      isDefaultToonTexture: true,
      name: 'skin',
      opacity: 1,
      outline: { alpha: 0, color: new Color(), visible: false, width: 0 },
      shininess: 0,
      specular: new Color(0, 0, 0),
      toonMap,
      toonMapFileName: 'toon.bmp',
    }
    const plain = new MMDToonMaterial(descriptor)
    const mapped = new MMDToonMaterial({ ...descriptor, sphereMap, sphereBlendMode: 'multiply' })
    const geometry = new PlaneGeometry(2, 2)
    const mesh = new Mesh(geometry, plain)
    const scene = new Scene()
    scene.add(mesh, new AmbientLight(0xFFFFFF, 0.6))
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 2
    const renderer = new WebGLRenderer({ preserveDrawingBuffer: true })
    renderer.setSize(8, 8)
    renderer.toneMapping = NoToneMapping
    const gl = renderer.getContext()
    const pixel = () => {
      renderer.render(scene, camera)
      const result = new Uint8Array(4)
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, result)
      return Array.from(result)
    }
    try {
      for (const glow of [0, 0.45]) {
        plain.emissive.copy(descriptor.diffuse)
        mapped.emissive.copy(descriptor.diffuse)
        plain.emissiveIntensity = glow
        mapped.emissiveIntensity = glow
        mesh.material = plain
        const expected = pixel()
        expect(expected[0]).toBeGreaterThan(20)
        mesh.material = mapped
        expect(pixel()).toEqual(expected)
      }
    }
    finally {
      renderer.dispose()
      renderer.forceContextLoss()
      geometry.dispose()
      plain.dispose()
      mapped.dispose()
      sphereMap.dispose()
      toonMap.dispose()
    }
  })
})
