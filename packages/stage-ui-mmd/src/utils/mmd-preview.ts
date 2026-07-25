import type { Object3D } from 'three'

import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'

import { loadMMDModelFromSource } from './mmd-loader'

function disposeObject(root: Object3D) {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry?.dispose?.()
      const material = obj.material
      if (Array.isArray(material))
        material.forEach(m => m.dispose())
      else
        material?.dispose?.()
    }
  })
}

/**
 * Renders an MMD model file to an offscreen canvas and returns a preview data
 * URL for the model-selector card.
 *
 * Deliberately physics-free: the thumbnail shows the model in its rest pose,
 * so there is no need to initialize Ammo or step the simulation. This keeps
 * preview generation cheap and avoids loading the WASM physics binary just to
 * import a model.
 */
export async function loadMMDModelPreview(file: File): Promise<string | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 2560

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setSize(canvas.width, canvas.height, false)
  renderer.setPixelRatio(1)

  const scene = new Scene()
  const camera = new PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 1000)
  scene.add(new AmbientLight(0xFFFFFF, 0.9))
  const directional = new DirectionalLight(0xFFFFFF, 1.0)
  directional.position.set(1, 2, 2)
  scene.add(directional)

  const objectUrl = URL.createObjectURL(file)
  let resolved: Awaited<ReturnType<typeof loadMMDModelFromSource>> | undefined
  let group: Group | undefined

  try {
    resolved = await loadMMDModelFromSource(objectUrl, { waitForTextures: true })
    group = new Group()
    group.add(resolved.mesh)
    scene.add(group)
    group.updateMatrixWorld(true)

    const box = new Box3().setFromObject(group)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    // Fit to both axes for the portrait preview canvas so the model is not
    // cropped or shrunk into the distance.
    const vFov = (camera.fov * Math.PI) / 180
    const fitHeightDistance = (size.y / 2) / Math.tan(vFov / 2)
    const fitWidthDistance = (size.x / 2) / (Math.tan(vFov / 2) * camera.aspect)
    const distance = 1.15 * Math.max(fitHeightDistance, fitWidthDistance)
    camera.position.set(center.x, center.y, center.z + distance)
    camera.near = Math.max(distance / 100, 0.01)
    camera.far = distance * 100
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    renderer.render(scene, camera)
    return canvas.toDataURL()
  }
  finally {
    if (group)
      disposeObject(group)
    resolved?.dispose()
    scene.clear()
    renderer.renderLists.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    URL.revokeObjectURL(objectUrl)
    canvas.width = 0
    canvas.height = 0
  }
}
