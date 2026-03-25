import type { VRM } from '@pixiv/three-vrm'
import type { Group, Material, Object3D } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { AmbientLight, AnimationMixer, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

import { animations } from '../assets/vrm'
import { clipFromVRMAnimation, loadVrm, loadVRMAnimation, reAnchorRootPositionTrack } from '../composables/vrm'

function disposePreviewVrm(vrm?: VRM, group?: Group) {
  group?.removeFromParent()

  if (vrm) {
    VRMUtils.deepDispose(vrm.scene as unknown as Object3D)
  }
}

function disposePreviewRenderer(renderer: WebGLRenderer) {
  renderer.renderLists.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
}

function hasMaterialUpdate(material: Material): material is Material & { update: (delta: number) => void } {
  return typeof (material as { update?: unknown }).update === 'function'
}

function updatePreviewVrmMaterials(vrm: VRM | undefined, delta: number) {
  // NOTICE: three-vrm drives MToon per-frame uniforms, including alphaTest used by MASK cutout,
  // through material.update(delta). The preview path renders a one-shot offscreen frame instead of
  // using VRM.update(delta), so we need to forward material updates manually before rendering.
  vrm?.materials?.forEach((material) => {
    if (hasMaterialUpdate(material))
      material.update(delta)
  })
}

/**
 * Render a VRM file to an offscreen canvas and return a preview data URL.
 */
export async function loadVrmModelPreview(file: File) {
  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = 1440
  offscreenCanvas.height = 2560

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
  let vrmGroup: Group | undefined
  let mixer: AnimationMixer | undefined
  const previewDelta = 0.1

  try {
    const vrmData = await loadVrm(objUrl, { scene, lookAt: true })
    if (!vrmData)
      return

    vrmInstance = vrmData._vrm
    vrmGroup = vrmData._vrmGroup
    const { modelCenter, initialCameraOffset } = vrmData

    camera.position.copy(modelCenter).add(initialCameraOffset)
    camera.lookAt(modelCenter)
    camera.updateProjectionMatrix()

    try {
      const animation = await loadVRMAnimation(animations.idleLoop.toString())
      const clip = await clipFromVRMAnimation(vrmData._vrm, animation)
      if (clip) {
        reAnchorRootPositionTrack(clip, vrmData._vrm)
        mixer = new AnimationMixer(vrmData._vrm.scene)
        const action = mixer.clipAction(clip)
        action.play()
        mixer.update(previewDelta)
      }
    }
    catch (err) {
      console.warn('Failed to load VRM animation for preview:', err)
    }

    updatePreviewVrmMaterials(vrmInstance, previewDelta)
    renderer.render(scene, camera)

    const dataUrl = offscreenCanvas.toDataURL()
    return dataUrl
  }
  finally {
    mixer?.stopAllAction()
    disposePreviewVrm(vrmInstance, vrmGroup)
    scene.clear()
    disposePreviewRenderer(renderer)
    URL.revokeObjectURL(objUrl)
    offscreenCanvas.width = 0
    offscreenCanvas.height = 0
  }
}
