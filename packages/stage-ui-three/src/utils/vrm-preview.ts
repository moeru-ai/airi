import type { VRM } from '@pixiv/three-vrm'

import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * Render a VRM file to an offscreen canvas and return a preview data URL.
 * Uses minimal loading (matching the standalone test harness) to avoid
 * megazord issues caused by VRMUtils optimizations or shader injection.
 */
export async function loadVrmModelPreview(file: File) {
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

  const objUrl = URL.createObjectURL(file)
  let vrmInstance: VRM | undefined

  try {
    // Direct loading — same as test harness, bypass core.ts
    const loader = new GLTFLoader()
    loader.crossOrigin = 'anonymous'
    loader.register(parser => new VRMLoaderPlugin(parser))

    const gltf = await loader.loadAsync(objUrl)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm)
      return

    vrmInstance = vrm

    // VRM0 rotation support
    VRMUtils.rotateVRM0(vrm)

    // Add to scene
    scene.add(vrm.scene)

    // Compute bounding box for camera framing
    const box = new Box3().setFromObject(vrm.scene)
    const modelSize = new Vector3()
    const modelCenter = new Vector3()
    box.getSize(modelSize)
    box.getCenter(modelCenter)

    // Hardcode camera to be clearly in front at +Z
    // (Model center Y is around the waist/chest. Adding 25% of height points roughly at the head)
    const headY = modelCenter.y + (modelSize.y * 0.25)
    camera.position.set(modelCenter.x, headY, 1.2)

    // Look directly at the face
    const target = new Vector3(modelCenter.x, headY, 0)
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    // CRITICAL FIX: The test harness runs an animation loop that calls vrm.update(delta).
    // The static preview doesn't. Calling update(0) forces the VRM ExpressionManager
    // and springbones to initialize cleanly, which should clear the default "megazord" state
    // that might be baked into the raw GLTF meshes.
    if (vrmInstance && vrmInstance.update) {
      vrmInstance.update(0)
    }

    renderer.render(scene, camera)

    const dataUrl = offscreenCanvas.toDataURL()
    return dataUrl
  }
  finally {
    renderer.dispose()
    if (vrmInstance) {
      VRMUtils.deepDispose(vrmInstance.scene)
    }
    URL.revokeObjectURL(objUrl)
    if (offscreenCanvas.isConnected)
      document.body.removeChild(offscreenCanvas)
  }
}
