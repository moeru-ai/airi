<script setup lang="ts">
/* eslint-disable style/max-statements-per-line */
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip, Group, Texture } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  AnimationMixer,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Quaternion,
  RawShaderMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import { clipFromVRMAnimation, loadVRMAnimation, useBlink, useIdleEyeSaccades } from '../../../composables/vrm/animation'
import { loadVrm } from '../../../composables/vrm/core'
import { useVRMEmote } from '../../../composables/vrm/expression'
import { useVRM } from '../../../stores/vrm'

const props = defineProps<{
  modelSrc?: string
  idleAnimation: string
  loadAnimations?: string[]
  paused: boolean
  nprEquirectTex?: Texture | null
}>()

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
  (e: 'modelReady'): void
}>()

let disposeBeforeRenderLoop: (() => void | undefined)

const modelLoading = ref(false)
const modelLoaded = ref(false)
const modelSrcRef = toRef(() => props.modelSrc)

const vrm = ref<VRMCore>()
const vrmAnimationMixer = ref<AnimationMixer>()
const { scene } = useTresContext()
const { onBeforeRender } = useLoop()
const blink = useBlink()
const vrmEmote = ref<ReturnType<typeof useVRMEmote>>()

const vrmStore = useVRM()
const {
  modelOffset,
  modelOrigin,
  modelSize,
  cameraPosition,
  modelRotationY,
  lookAtTarget,
  eyeHeight,
  trackingMode,

  envSelect,
  specularMix,
  skyBoxIntensity,
} = storeToRefs(vrmStore)
const vrmGroup = ref<Group>()
const idleEyeSaccades = useIdleEyeSaccades()

const nprProgramVersion = ref(0)

async function loadModel() {
  await until(modelLoading).not.toBeTruthy()
  modelLoading.value = true
  modelLoaded.value = false

  try {
    if (!scene.value) {
      console.warn('Scene is not ready, cannot load VRM model.')
      return
    }
    if (vrm.value) {
      componentCleanUp()
    }
    if (!modelSrcRef.value) {
      return
    }

    try {
      const _vrmInfo = await loadVrm(modelSrcRef.value, {
        scene: scene.value,
        lookAt: true,
        onProgress: progress => emit('loadModelProgress', Number((100 * progress.loaded / progress.total).toFixed(2))),
      })
      if (!_vrmInfo || !_vrmInfo._vrm) {
        console.warn('No VRM model loaded')
        return
      }
      const {
        _vrm,
        _vrmGroup,
        modelCenter: vrmModelCenter,
        modelSize: vrmModelSize,
        initialCameraOffset: vrmInitialCameraOffset,
      } = _vrmInfo

      vrmGroup.value = _vrmGroup

      // Set initial camera position
      cameraPosition.value = {
        x: vrmModelCenter.x + vrmInitialCameraOffset.x,
        y: vrmModelCenter.y + vrmInitialCameraOffset.y,
        z: vrmModelCenter.z + vrmInitialCameraOffset.z,
      }
      // cameraDistance.value = vrmInitialCameraOffset.length()

      // Set initial positions for model
      modelOrigin.value = {
        x: vrmModelCenter.x,
        y: vrmModelCenter.y,
        z: vrmModelCenter.z,
      }
      modelSize.value = {
        x: vrmModelSize.x,
        y: vrmModelSize.y,
        z: vrmModelSize.z,
      }

      vrmGroup.value.position.set(
        modelOffset.value.x,
        modelOffset.value.y,
        modelOffset.value.z,
      )

      // Set model facing direction
      const targetDirection = new Vector3(0, 0, -1) // Default facing direction
      const lookAt = _vrm.lookAt
      const quaternion = new Quaternion()
      if (lookAt) {
        const facingDirection = lookAt.faceFront
        quaternion.setFromUnitVectors(facingDirection.normalize(), targetDirection.normalize())
        _vrmGroup.quaternion.premultiply(quaternion)
        _vrmGroup.updateMatrixWorld(true)
      }
      else {
        console.warn('No look-at target found in VRM model')
      }
      // Reset model rotation Y
      modelRotationY.value = 0

      // Set initial positions for animation
      function reAnchorRootPositionTrack(clip: AnimationClip) {
      // Get the hips node to re-anchor the root position track
        const hipNode = _vrm.humanoid?.getNormalizedBoneNode('hips')
        if (!hipNode) {
          console.warn('No hips node found in VRM model.')
          return
        }
        hipNode.updateMatrixWorld(true)
        const defaultHipPos = new Vector3()
        hipNode.getWorldPosition(defaultHipPos)

        // Calculate the offset from the hips node to the hips's first frame position
        const hipsTrack = clip.tracks.find(track =>
          track.name.endsWith('Hips.position'),
        )
        if (!(hipsTrack instanceof VectorKeyframeTrack)) {
          console.warn('No Hips.position track of type VectorKeyframeTrack found in animation.')
          return
        }

        const animeHipPos = new Vector3(
          hipsTrack.values[0],
          hipsTrack.values[1],
          hipsTrack.values[2],
        )
        const animeDelta = new Vector3().subVectors(animeHipPos, defaultHipPos)

        clip.tracks.forEach((track) => {
          if (track.name.endsWith('.position') && track instanceof VectorKeyframeTrack) {
            for (let i = 0; i < track.values.length; i += 3) {
              track.values[i] -= animeDelta.x
              track.values[i + 1] -= animeDelta.y
              track.values[i + 2] -= animeDelta.z
            }
          }
        })
      }

      const animation = await loadVRMAnimation(props.idleAnimation)
      const clip = await clipFromVRMAnimation(_vrm, animation)
      if (!clip) {
        console.warn('No VRM animation loaded')
        return
      }
      // Re-anchor the root position track to the model origin
      reAnchorRootPositionTrack(clip)

      // play animation
      vrmAnimationMixer.value = new AnimationMixer(_vrm.scene)
      vrmAnimationMixer.value.clipAction(clip).play()

      vrmEmote.value = useVRMEmote(_vrm)

      // TODO: perhaps we should allow user to choose whether to enable
      //       this kind of behavior or not?
      // - Lilia: NO need, cause NPR mat should always follow NPR route, and BPR mat shoule always follow PBR route.
      // WORKAROUND: set to use envMapIntensity for all matched materials
      // - Lilia: YES, envMapIntensity will be exposed to GUI user to adjust.
      // REVIEW: MeshToonMaterial, and MeshBasicMaterial will not be affected
      //         since they do not have envMapIntensity property
      // - Lilia: NPR mat can be affected by envMapIntensity if we choose to user skybox as envMap
      //        This part will be implemented as a NPR HDRI shader injection
      _vrm.scene.traverse((child) => {
        if (child instanceof Mesh && child.material) {
          const material = Array.isArray(child.material) ? child.material : [child.material]
          material.forEach((mat) => {
            if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
              // Should read envMap intensity from outside props
              mat.envMapIntensity = 1.0
              mat.needsUpdate = true
            }
            else if (
              mat instanceof MeshToonMaterial
              || mat instanceof MeshBasicMaterial
              || mat instanceof ShaderMaterial
              || mat instanceof RawShaderMaterial
            ) {
              // close tone mapping for NPR materials
              if ('toneMapped' in mat)
                mat.toneMapped = false
              // disable envMap for NPR materials, envMap will be reassigned by default skybox
              if ('envMap' in mat && mat.envMap)
                mat.envMap = null
              // NPR materials usually use sRGB textures
              if ('map' in mat && mat.map && 'colorSpace' in mat.map) {
                // try...catch to avoid some weird error (diff verion of three.js?)
                try { mat.map.colorSpace = SRGBColorSpace }
                catch {}
              }

              // Foce recompile shader to inject npr env shader at the begining
              const baseKey = mat.customProgramCacheKey?.() ?? ''
              mat.customProgramCacheKey = () => `${baseKey}|npr:${nprProgramVersion.value}`

              // NPR shader injection
              const prevOnBeforeCompile = mat.onBeforeCompile
              mat.onBeforeCompile = (shader: any, renderer: any) => {
                // Keep the previous onBeforeCompile behaviour if any
                prevOnBeforeCompile?.(shader, renderer)
                // Obtain skybox texture from scene environment
                const equirectTex = props.nprEquirectTex ?? null

                // If no normal, then skip the rest
                const hasNormal = shader.fragmentShader.includes('vNormal')
                if (!hasNormal)
                  return

                // Setup uniforms
                shader.uniforms.uNprEnvMode = { value: (envSelect.value === 'hemisphere') ? 0 : 2 } // 0=hemi: no further injection; 2=skybox
                shader.uniforms.uEnvIntensity = { value: skyBoxIntensity.value } // exposed to GUI
                shader.uniforms.uEnvMapEquirect = { value: equirectTex }
                shader.uniforms.uSpecularMix = { value: specularMix.value }

                // If it has viewDir, then we can do reflection
                const hasView = shader.fragmentShader.includes('vViewPosition')

                // Shader injection!
                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <common>',
                  `
                      #include <common>
                      uniform int   uNprEnvMode;         // 0=off, 2=Skybox
                      uniform float uEnvIntensity;
                      uniform float uSpecularMix;       // 0=diffuse only, 1=specular only

                      uniform sampler2D uEnvMapEquirect; // Skybox(equirect)
                      // --- Direction to equirectangular UV ---
                      vec2 dirToEquirectUV(vec3 d){
                        d = normalize(d);
                        float phi = atan(d.z, d.x);
                        float th  = asin(clamp(d.y, -1.0, 1.0));
                        return vec2(0.5 + phi/(2.0*PI), 0.5 - th/PI);
                      }
                      `,
                ).replace(
                  '#include <dithering_fragment>',
                  `
                      // --- NPR skybox env lighting injection ---
                      vec3 n = normalize(vNormal);

                      // Skybox lighting: equirect sampling -  difuse & reflection
                      vec3 envCol = vec3(0.0);
                      if(uNprEnvMode == 2) {
                        ${hasView
                          ? `vec3 v = normalize(vViewPosition);
                            vec3 r = reflect(v, n);`
                          : `vec3 r = n;`}

                        vec3 nW = inverseTransformDirection(n, viewMatrix);
                        vec3 rW = inverseTransformDirection(r, viewMatrix);
                        vec3 vW = normalize(reflect(-rW, nW));

                        // To resolve the upside-down reflection issue of equirect map
                        nW.z = -nW.z;
                        rW.z = -rW.z;
                        
                        float NoV = clamp(dot(nW, vW), 0.0, 1.0);

                        // Specular term
                        vec3 envSpec = texture2D(uEnvMapEquirect, dirToEquirectUV(rW)).rgb;
                        // TODO: NPR style specular? how to do that?

                        // Diffuse term
                        vec3 envDiff    = texture2D(uEnvMapEquirect, dirToEquirectUV(-nW)).rgb;
                        // TODO: NPR style diffuse? how to do that?

                        // Mix specular and diffuse
                        envCol = uSpecularMix * envSpec + (1.0 - uSpecularMix) * envDiff;

                        // skybox color mixing 
                        gl_FragColor.rgb += envCol * uEnvIntensity;
                      }
                      // --- Injection ends ---

                      #include <dithering_fragment>
                      `,
                )
                mat.userData.__nprUniforms = shader.uniforms
              }
              mat.needsUpdate = true
            }
            // console.debug('material: ', mat)
          })
        }
      })

      vrm.value = _vrm

      emit('modelReady')
      modelLoaded.value = true

      function getEyePosition(): number | null {
        const eye = vrm.value?.humanoid?.getNormalizedBoneNode('head')
        if (!eye)
          return null
        const eyePos = new Vector3()
        eye.getWorldPosition(eyePos)
        return eyePos.y
      }
      eyeHeight.value = getEyePosition()
      trackingMode.value = 'none'
      lookAtTarget.value = {
        x: 0,
        y: eyeHeight.value,
        z: -1000,
      }

      disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
        vrmAnimationMixer.value?.update(delta)
        vrm.value?.update(delta)
        vrm.value?.lookAt?.update?.(delta)
        blink.update(vrm.value, delta)
        idleEyeSaccades.update(vrm.value, lookAtTarget, delta)
        vrmEmote.value?.update(delta)
      }).off
    }
    catch (err) {
    // This is needed otherwise the URL input will be locked forever...
      emit('error', err)
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    modelLoading.value = false
  }
}

watch(modelOffset, () => {
  if (vrmGroup.value) {
    vrmGroup.value.position.set(
      modelOffset.value.x,
      modelOffset.value.y,
      modelOffset.value.z,
    )
  }
}, { deep: true })

watch(modelRotationY, (newRotationY) => {
  if (vrm.value && vrmGroup.value) {
    vrmGroup.value.rotation.y = MathUtils.degToRad(newRotationY)
  }
})

// watch if the model needs to be reloaded
watch(modelSrcRef, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc) {
    loadModel()
  }
})

const { pause, resume } = useLoop()

watch(() => props.paused, value => value ? pause() : resume())

function componentCleanUp() {
  disposeBeforeRenderLoop?.()
  if (vrm.value) {
    vrm.value.scene.removeFromParent()
    VRMUtils.deepDispose(vrm.value.scene)
  }
}

// Switch to NPR SkyBox
function updateNprUniforms(tex: Texture | null) {
  const root = vrm.value?.scene
  if (!root)
    return

  const mode = (envSelect.value === 'skyBox' && !!tex) ? 2 : 0 // 0=off，2=skybox
  root.traverse((child) => {
    if (child instanceof Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat) => {
        const u = mat.userData?.__nprUniforms
        if (!u)
          return
        // Skybox texture and mode
        u.uEnvMapEquirect.value = tex
        u.uNprEnvMode.value = mode
        u.uEnvIntensity.value = skyBoxIntensity.value
        u.uSpecularMix.value = specularMix.value
      })
    }
  })
}
// watch NPR skybox
watch(
  () => [envSelect.value, props.nprEquirectTex, skyBoxIntensity.value, specularMix.value],
  async () => {
    nprProgramVersion.value += 1
    updateNprUniforms(props.nprEquirectTex ?? null)
  },
  { immediate: true, deep: false },
)

onMounted(async () => await loadModel())
onUnmounted(() => componentCleanUp())

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    componentCleanUp()
  })
}

defineExpose({
  setExpression(expression: string) {
    vrmEmote.value?.setEmotionWithResetAfter(expression, 1000)
  },
  scene: computed(() => vrm.value?.scene),
  lookAtUpdate(target: { x: number, y: number, z: number }) {
    idleEyeSaccades.instantUpdate(vrm.value, target)
  },
})
</script>

<template>
  <slot v-if="modelLoaded" />
</template>
