import type { MmdLoadResult } from '../composables/mmd'

import { loadMmd } from '../composables/mmd'

/**
 * Render an MMD file to an offscreen canvas and return a preview data URL.
 * This function expects a model URL and optionally a VMD animation URL.
 */
export async function loadMmdModelPreview(modelUrl: string, vmdUrl?: string): Promise<string | undefined> {
  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = 1440
  offscreenCanvas.height = 2560
  offscreenCanvas.style.position = 'absolute'
  offscreenCanvas.style.top = '0'
  offscreenCanvas.style.left = '0'
  offscreenCanvas.style.objectFit = 'cover'
  offscreenCanvas.style.display = 'block'
  offscreenCanvas.style.zIndex = '10000000000'
  offscreenCanvas.style.opacity = '0'
  document.body.appendChild(offscreenCanvas)

  // We need to import WebGLRenderer dynamically to avoid SSR issues
  const { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } = await import('three')

  const renderer = new WebGLRenderer({
    canvas: offscreenCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(offscreenCanvas.width, offscreenCanvas.height, false)
  renderer.setPixelRatio(1)

  const scene = new Scene()
  const camera = new PerspectiveCamera(40, offscreenCanvas.width / offscreenCanvas.height, 0.01, 1000)
  const ambientLight = new AmbientLight(0xFFFFFF, 0.8)
  const directionalLight = new DirectionalLight(0xFFFFFF, 0.8)
  directionalLight.position.set(1, 1, 1)
  scene.add(ambientLight, directionalLight)

  let mmdResult: MmdLoadResult | undefined

  try {
    mmdResult = await loadMmd(modelUrl, {
      scene,
      vmdUrl,
    })

    if (!mmdResult) {
      return undefined
    }

    const { modelCenter, initialCameraOffset, mixer } = mmdResult

    camera.position.copy(modelCenter).add(initialCameraOffset)
    camera.lookAt(modelCenter)
    camera.updateProjectionMatrix()

    // Update animation mixer if available
    if (mixer) {
      mixer.update(0.1)
    }

    renderer.render(scene, camera)

    const dataUrl = offscreenCanvas.toDataURL()
    return dataUrl
  }
  finally {
    renderer.dispose()

    // Clean up MMD resources
    if (mmdResult?.mesh) {
      mmdResult.mesh.traverse((child) => {
        const node = child as any
        if (node.geometry?.dispose)
          node.geometry.dispose()

        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          for (const mat of materials) {
            if (mat?.map?.dispose)
              mat.map.dispose()
            mat?.dispose?.()
          }
        }
      })
    }

    if (offscreenCanvas.isConnected)
      document.body.removeChild(offscreenCanvas)
  }
}
