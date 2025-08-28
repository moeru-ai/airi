<script setup lang="ts">
/* eslint-disable style/max-statements-per-line */
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip, Group, Material, SphericalHarmonics3, Texture } from 'three'

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
  nprEquirectTex: Texture | null
  nprIrrSH: SphericalHarmonics3 | null
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

// Try the best to extract the matcap texture from various possible places
// TODO: this function should be refactored and moved to composables/vrm
function extractMatcapTexture(mat: any): Texture | null {
  // a) MeshMatcapMaterial
  if ('matcap' in mat && mat.matcap)
    return mat.matcap as Texture

  // b) For common MToon materials, it might be under uniforms
  const u = (mat as any).uniforms
  if (u) {
    // try different possible names...
    if (u.matcapTexture?.value)
      return u.matcapTexture.value as Texture
    if (u.sphereAddTexture?.value)
      return u.sphereAddTexture.value as Texture
    if (u._MatCapTex?.value)
      return u._MatCapTex.value as Texture
    if (u._SphereAdd?.value)
      return u._SphereAdd.value as Texture
  }

  // c) If the matcap is in the gltf extension
  const ud = (mat as any).userData || {}
  const ext = ud.gltfExtensions?.VRMC_materials_mtoon || ud.vrmMaterialProperties || ud.mtoon
  if (ext) {
    // Different possible names...
    const cand
      = ext.matcapTexture
        || ext.sphereAddTexture
        || ext.matcap
        || ext.sphereAdd
    if (cand && cand.isTexture)
      return cand as Texture
  }

  return null
}

// flaten the irrSH to array of Vector3
function shToVec3Array(sh: SphericalHarmonics3 | null): Vector3[] {
  const arr: Vector3[] = Array.from({ length: 9 }, () => new Vector3())
  if (!sh)
    return arr
  for (let i = 0; i < 9; i++) arr[i].copy(sh.coefficients[i])
  return arr
}

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
                // use the type assertion to fix TS error...
                const m = mat as unknown as Material & {
                  extensions?: { shaderTextureLOD?: boolean }
                }
                m.extensions = { ...(m.extensions || {}), shaderTextureLOD: true }
                // If matcap texture is available, then use matcap in IBL specular reflection
                const matcapTex = extractMatcapTexture(mat)

                // If no normal, then skip the rest
                const hasNormal = shader.fragmentShader.includes('vNormal')
                if (!hasNormal)
                  return

                // --- vWorldPos/vWorldNormal ---
                if (!shader.vertexShader.includes('varying vec3 vWorldPos')) {
                  shader.vertexShader
                    = `
                    varying vec3 vWorldPos;
                    varying vec3 vWorldNormal;
                    ${shader.vertexShader}`
                }
                if (!shader.fragmentShader.includes('varying vec3 vWorldPos')) {
                  shader.fragmentShader
                    = `
                    varying vec3 vWorldPos;
                    varying vec3 vWorldNormal;
                    ${shader.fragmentShader}`
                }

                // --- vertex shader injection ---
                shader.vertexShader = shader.vertexShader
                  .replace(
                    '#include <defaultnormal_vertex>',
                    `
                    #include <defaultnormal_vertex>
                    vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
                    `,
                  )
                  .replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
                    `,
                  )

                // Setup uniforms
                shader.uniforms.uNprEnvMode = { value: (envSelect.value === 'hemisphere') ? 0 : 2 } // 0=hemi: no further injection; 2=skybox
                shader.uniforms.uEnvIntensity = { value: skyBoxIntensity.value } // exposed to GUI
                shader.uniforms.uEnvMapEquirect = { value: equirectTex }
                shader.uniforms.uSpecularMix = { value: specularMix.value }
                // LOD mip
                shader.uniforms.uEnvMaxMip = { value: 8.0 }
                shader.uniforms.uBrightMip = { value: 2.0 } // bright color = low mip
                shader.uniforms.uShadowMip = { value: 8.0 } // shadow color = high mip
                // Tint
                // 染色强度控制
                shader.uniforms.uHighlightTint = { value: 0.6 }
                shader.uniforms.uShadowTint = { value: 0.35 }
                // Specular uniforms for NPR skybox
                shader.uniforms.uSpecToonThreshold = { value: 0.9 } // highlight threshold
                shader.uniforms.uSpecToonWidth = { value: 0.15 } // highlight width
                shader.uniforms.uSpecPower = { value: 10.0 } // highlight sharpness
                shader.uniforms.uSpecMip = { value: 8.0 } // default LOD mip level for specular
                // Irradiance sampling
                const emptySH: Vector3[] = Array.from({ length: 9 }, () => new Vector3())
                shader.uniforms.uSHCoeffs = { value: emptySH }
                // Specular matcap
                // shader.uniforms.uUseMatcap         = { value: !!matcapTex }
                shader.uniforms.uUseMatcap = { value: false }
                shader.uniforms.uMatcap = { value: matcapTex ?? null }
                shader.uniforms.uMatcapIntensity = { value: 1.0 }

                // console.debug('same matcap?', matcapTex === shader.uniforms.uMatcap.value)

                // Shader injection!
                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <common>',
                  `
                      #include <common>
                      uniform int   uNprEnvMode;         // 0=off, 2=Skybox
                      uniform float uEnvIntensity;
                      uniform float uSpecularMix;       // 0=diffuse only, 1=specular only

                      uniform float uSpecToonThreshold;
                      uniform float uSpecToonWidth;
                      uniform float uSpecPower; 
                      uniform bool  uUseMatcap;
                      uniform sampler2D uMatcap;
                      uniform float uMatcapIntensity;
                      
                      uniform sampler2D uEnvMapEquirect; // Skybox(equirect)

                      uniform vec3 uSHCoeffs[9];  // for irradiance
                      uniform float uSpecMip;   // default LOD mip for specular

                      // --- Direction to equirectangular UV ---
                      vec2 dirToEquirectUV(vec3 d){
                        d = normalize(d);
                        float phi = atan(d.z, d.x);
                        float th  = asin(clamp(d.y, -1.0, 1.0));
                        return vec2(0.5 + phi/(2.0*PI), 0.5 - th/PI);
                      }

                      // --- Spherical Harmonics (3rd order) for diffuse IBL ---

                      // Constants for SH basis functions
                      const float C0 = 1.0 / (2.0 * sqrt(PI));
                      const float C1 = sqrt(3.0 / PI) / 2.0;
                      const float C2 = sqrt(15.0 / PI) / 2.0;
                      const float C3 = sqrt(5.0 / PI) / 4.0;
                      const float C4 = sqrt(15.0 / PI) / 4.0;

                      vec3 evalIrradianceSH( vec3 n ) {
                        vec3 sh = vec3(0.0);
                        sh += uSHCoeffs[0] * C0;
                        sh += uSHCoeffs[1] * (-C1 * n.y);
                        sh += uSHCoeffs[2] * ( C1 * n.z);
                        sh += uSHCoeffs[3] * (-C1 * n.x);
                        sh += uSHCoeffs[4] * ( C2 * n.x * n.y);
                        sh += uSHCoeffs[5] * (-C2 * n.y * n.z);
                        sh += uSHCoeffs[6] * ( C3 * (3.0 * n.z * n.z - 1.0));
                        sh += uSHCoeffs[7] * (-C2 * n.x * n.z);
                        sh += uSHCoeffs[8] * ( C4 * (n.x * n.x - n.y * n.y));
                        return sh;
                      }
                      `,
                ).replace(
                  '#include <dithering_fragment>',
                  `
                      // --- NPR skybox env lighting injection ---
                      vec3 n = normalize(vNormal);
                      vec3 nW = inverseTransformDirection(n, viewMatrix);

                      vec3 envCol = vec3(0.0);
                      if(uNprEnvMode == 2) {
                        // View direction in world space
                        #ifdef USE_VIEWPOSITION
                          vec3 v = normalize(-vViewPosition);
                          vec3 vW = inverseTransformDirection(v, viewMatrix);
                        #else
                          vec3 vW = normalize(-cameraPosition);
                        #endif

                        // Reflection direction in world space
                        vec3 rW = reflect(-vW, nW);

                        // To resolve the upside-down reflection issue of equirect map
                        // nW.y = -nW.y;
                        // rW.y = -rW.y;                       
                        
                        // --- IBL Diffusion ---
                        // SH-based irradiance
                        vec3 I = evalIrradianceSH(nW);
                        vec3 albedo = gl_FragColor.rgb;
                        // albedo/pi * I(n)
                        vec3 envDiff = (albedo / 3.14159265) * I * (uEnvIntensity);
                        // TODO: Tint

                        // --- IBL Specular reflection ---
                        // TODO: a more stylistic specular reflection model. Is specular necessary?
                        vec3 envSpec;
                        if (uUseMatcap) {
                          // Matcap-based specular
                          vec3 V = vec3(0.0, 0.0, 1.0);
                          vec3 nV = n;
                          vec3 R = reflect(-V, nV);
                          float m = 2.0 * sqrt( pow(R.x, 2.0) + pow(R.y, 2.0) + pow(R.z + 1.0, 2.0) );
                          vec2 uvMC = R.xy / m * 0.5 + 0.5;
                          vec3 matcapCol = texture2D(uMatcap, uvMC).rgb;
                          envSpec = matcapCol * uMatcapIntensity;
                        }
                        else {
                          // Equirect-based specular, LOD needed for NPR
                          vec3 N = normalize(vWorldNormal);
                          vec3 V = normalize(cameraPosition - vWorldPos); // camera to frag
                          vec3 R = reflect(-V, N);
                          vec2 uvRef = dirToEquirectUV(R);
                          #if __VERSION__ >= 300
                            vec3 envRef = textureLod(uEnvMapEquirect, uvRef, uSpecMip).rgb;
                          #else
                            #ifdef GL_EXT_shader_texture_lod
                              vec3 envRef = texture2DLodEXT(uEnvMapEquirect, uvRef, uSpecMip).rgb;
                            #else
                              vec3 envRef = texture2D(uEnvMapEquirect, uvRef).rgb;
                            #endif
                          #endif
                          // Blinn/Phong
                          float specRaw = clamp(dot(R, V), 0.0, 1.0);
                          float sToon = smoothstep(uSpecToonThreshold - uSpecToonWidth,
                                                  uSpecToonThreshold + uSpecToonWidth, specRaw);
                          envSpec = pow(sToon, uSpecPower) * envRef * uEnvIntensity;
                        }

                        // Mix specular and diffuse
                        envCol = mix(envDiff, envSpec, uSpecularMix);

                        // skybox color mixing 
                        gl_FragColor.rgb += envCol;
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
function updateNprUniforms(tex: Texture | null, nprIrrSH?: SphericalHarmonics3 | null) {
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
        // Update SH coeffs after the skybox is ready
        if (u.uSHCoeffs && nprIrrSH) {
          // console.debug('Updating SH coeffs with new props.nprIrrSH:', props.nprIrrSH)
          const irrSH = shToVec3Array(nprIrrSH)
          for (let i = 0; i < 9; i++) {
            u.uSHCoeffs.value[i].copy(irrSH[i])
          }
          // console.debug('Updated SH coeffs:', u.uSHCoeffs.value)
        }
        // Update LOD max mip based on the texture size when the skybox is ready
        if (tex?.image?.width && tex?.image?.height) {
          const maxMip = Math.floor(Math.log2(Math.max(tex.image.width, tex.image.height)))
          u.uEnvMaxMip.value = maxMip
          u.uShadowMip.value = maxMip // max mip for shadow tint
        }
      })
    }
  })
}
// watch NPR skybox
watch(
  () => [
    envSelect.value,
    props.nprEquirectTex,
    skyBoxIntensity.value,
    specularMix.value,
    props.nprIrrSH,
  ],
  async () => {
    nprProgramVersion.value += 1
    updateNprUniforms(props.nprEquirectTex ?? null, props.nprIrrSH ?? null)
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
