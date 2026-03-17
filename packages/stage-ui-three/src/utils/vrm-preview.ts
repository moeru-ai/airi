import type { VRM } from '@pixiv/three-vrm'

import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

import { loadVrm } from '../composables/vrm'

/**
 * Render a VRM file to an offscreen canvas and return a preview data URL.
 */
export async function loadVrmModelPreview(input: File | string, expressions?: Record<string, number>) {
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

  const objUrl = typeof input === 'string' ? input : URL.createObjectURL(input)
  let vrmInstance: VRM | undefined

  try {
    const vrmData = await loadVrm(objUrl, { scene, lookAt: true })
    if (!vrmData)
      return

    vrmInstance = vrmData._vrm
    const { modelCenter, initialCameraOffset } = vrmData

    // Use core.ts's precomputed offset to frame the model perfectly from the front
    camera.position.copy(modelCenter).add(initialCameraOffset)
    camera.lookAt(modelCenter)
    camera.updateProjectionMatrix()

    // Apply active expressions if provided
    if (expressions && vrmInstance.expressionManager) {
      for (const [name, weight] of Object.entries(expressions)) {
        vrmInstance.expressionManager.setValue(name, weight)
      }
    }

    // VRM ExpressionManager needs an update to process the setValue calls
    if (vrmInstance.expressionManager) {
      vrmInstance.expressionManager.update()
    }

    // Force a few frames of update to ensure springbones and material offsets stabilize
    if (vrmInstance && vrmInstance.update) {
      vrmInstance.update(0.1)
      vrmInstance.update(0)
    }

    // Small delay to let textures/materials settle after updates
    await new Promise(resolve => setTimeout(resolve, 200))
    renderer.render(scene, camera)

    const dataUrl = offscreenCanvas.toDataURL()

    return dataUrl
  }
  catch (error) {
    console.error('Error during VRM capture:', error)
  }
  finally {
    renderer.dispose()
    if (vrmInstance) {
      vrmInstance.scene.traverse((child) => {
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
    if (typeof input !== 'string') {
      URL.revokeObjectURL(objUrl)
    }
    if (offscreenCanvas.isConnected)
      document.body.removeChild(offscreenCanvas)
  }
}
