import type { VRM } from '@pixiv/three-vrm'

import { AmbientLight, AnimationMixer, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

import { animations } from '../assets/vrm'
import { clipFromVRMAnimation, loadVrm, loadVRMAnimation, reAnchorRootPositionTrack } from '../composables/vrm'

/**
 * Render a VRM file to an offscreen canvas and return a preview data URL.
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
    const vrmData = await loadVrm(objUrl, { scene, lookAt: true })
    if (!vrmData)
      return

    vrmInstance = vrmData._vrm
    const { modelCenter, initialCameraOffset } = vrmData

    camera.position.copy(modelCenter).add(initialCameraOffset)
    camera.lookAt(modelCenter)
    camera.updateProjectionMatrix()

    try {
      const animation = await loadVRMAnimation(animations.idleLoop.toString())
      const clip = await clipFromVRMAnimation(vrmData._vrm, animation)
      if (clip) {
        reAnchorRootPositionTrack(clip, vrmData._vrm)
        const mixer = new AnimationMixer(vrmData._vrm.scene)
        const action = mixer.clipAction(clip)
        action.play()
        mixer.update(0.1)
      }
    }
    catch (err) {
      console.warn('Failed to load VRM animation for preview:', err)
    }

    renderer.render(scene, camera)

    const dataUrl = offscreenCanvas.toDataURL()
    return dataUrl
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
    URL.revokeObjectURL(objUrl)
    if (offscreenCanvas.isConnected)
      document.body.removeChild(offscreenCanvas)
  }
}
