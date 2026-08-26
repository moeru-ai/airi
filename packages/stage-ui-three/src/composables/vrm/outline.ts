import type { MToonMaterial, VRM } from '@pixiv/three-vrm'
import type { BufferGeometry, InterleavedBufferAttribute, Material } from 'three'

import type { VrmHook, VrmMaterialHookContext } from './hooks'

import { Float32BufferAttribute, Mesh } from 'three'

export const AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME = 'outlineNormal'
export const AIRI_OUTLINE_PREPROCESS_VERSION = 1
export const AIRI_OUTLINE_SHADER_PATCH_VERSION = 1

const AIRI_OUTLINE_PREPROCESS_USER_DATA_KEY = '__airiOutlinePreprocess'
const AIRI_OUTLINE_SHADER_PATCH_USER_DATA_KEY = '__airiOutlineShaderPatch'
const AIRI_OUTLINE_SHADER_PATCH_CACHE_KEY = `airiOutline:viewspace-v${AIRI_OUTLINE_SHADER_PATCH_VERSION}`
// NOTICE: These values are still tuning constants for the current view-space outline experiment.
// They should stay local to the outline patch until the geometry/screen-space hybrid strategy is settled.
const AIRI_OUTLINE_VIEW_FLATTENED_Z = -0.1
const AIRI_OUTLINE_VIEW_Z_OFFSET = -0.001
const POSITION_WELD_EPSILON = 1e-4
const ZERO_VECTOR_EPSILON = 1e-10
const SHADER_COMMON_ANCHOR = '#include <common>'
const SHADER_BEGINNORMAL_ANCHOR = '#include <beginnormal_vertex>'
const SHADER_OUTLINE_BLOCK_ANCHOR = `  #ifdef OUTLINE
    float worldNormalLength = length( transformedNormal );
    vec3 outlineOffset = outlineWidthFactor * worldNormalLength * objectNormal;

    #ifdef USE_OUTLINEWIDTHMULTIPLYTEXTURE
      vec2 outlineWidthMultiplyTextureUv = ( outlineWidthMultiplyTextureUvTransform * vec3( vUv, 1 ) ).xy;
      float outlineTex = texture2D( outlineWidthMultiplyTexture, outlineWidthMultiplyTextureUv ).g;
      outlineOffset *= outlineTex;
    #endif

    #ifdef OUTLINE_WIDTH_SCREEN
      outlineOffset *= vViewPosition.z / projectionMatrix[ 1 ].y;
    #endif

    gl_Position = projectionMatrix * modelViewMatrix * vec4( outlineOffset + transformed, 1.0 );

    gl_Position.z += 1E-6 * gl_Position.w; // anti-artifact magic
  #endif`

type NumericBufferAttribute = BufferGeometry['attributes'][string] | InterleavedBufferAttribute

interface VrmOutlineMeshTarget {
  builtInOutlineMaterial: MToonMaterial
  builtInOutlineMaterialIndex: number
  geometry: BufferGeometry
  mesh: Mesh
  surfaceMaterial: MToonMaterial
  surfaceMaterialIndex: number
}

interface OutlineGeometryState {
  version: number
}

interface OutlineMaterialState {
  version: number
}

interface VrmOutlineRuntimeState {
  meshes: VrmOutlineMeshTarget[]
}

const geometryStateRegistry = new WeakMap<BufferGeometry, OutlineGeometryState>()
const materialStateRegistry = new WeakMap<Material, OutlineMaterialState>()
const vrmOutlineRuntimeRegistry = new WeakMap<VRM, VrmOutlineRuntimeState>()

// State helpers
// NOTICE: We mirror the patch state in both WeakMap registries and geometry/material userData.
// The WeakMap prevents accidental cross-instance leaks in runtime bookkeeping, while userData
// preserves idempotence across cached VRM instances that keep the same Three objects alive.
function hasPatchedState<T extends BufferGeometry | Material>(
  object: T,
  key: string,
  version: number,
  registry: WeakMap<T, { version: number }>,
  extraCheck?: () => boolean,
) {
  const registryState = registry.get(object)
  const userDataState = object.userData?.[key]

  if (registryState?.version === version)
    return true

  if (userDataState?.version !== version)
    return false

  return extraCheck ? extraCheck() : true
}

function markPatchedState<T extends BufferGeometry | Material>(
  object: T,
  key: string,
  version: number,
  registry: WeakMap<T, { version: number }>,
  extraUserData: Record<string, unknown> = {},
) {
  registry.set(object, { version })
  ;(object.userData ||= {})[key] = {
    ...extraUserData,
    version,
  }
}

// Geometry preprocess
function isOutlineGeometryPreprocessed(geometry: BufferGeometry) {
  return hasPatchedState(
    geometry,
    AIRI_OUTLINE_PREPROCESS_USER_DATA_KEY,
    AIRI_OUTLINE_PREPROCESS_VERSION,
    geometryStateRegistry,
    () => geometry.getAttribute(AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME) != null,
  )
}

function markOutlineGeometryPreprocessed(geometry: BufferGeometry) {
  markPatchedState(
    geometry,
    AIRI_OUTLINE_PREPROCESS_USER_DATA_KEY,
    AIRI_OUTLINE_PREPROCESS_VERSION,
    geometryStateRegistry,
    { attribute: AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME },
  )
}

function quantizePositionComponent(value: number) {
  return Math.round(value / POSITION_WELD_EPSILON)
}

function addFaceNormal(accumulatedNormals: Float32Array, vertexIndex: number, x: number, y: number, z: number) {
  const base = vertexIndex * 3
  accumulatedNormals[base] += x
  accumulatedNormals[base + 1] += y
  accumulatedNormals[base + 2] += z
}

function writeNormalizedVector(target: Float32Array, vertexIndex: number, x: number, y: number, z: number) {
  const lengthSq = x * x + y * y + z * z
  const base = vertexIndex * 3

  if (lengthSq <= ZERO_VECTOR_EPSILON) {
    target[base] = 0
    target[base + 1] = 1
    target[base + 2] = 0
    return
  }

  const inverseLength = 1 / Math.sqrt(lengthSq)
  target[base] = x * inverseLength
  target[base + 1] = y * inverseLength
  target[base + 2] = z * inverseLength
}

function accumulateOriginalNormalFallback(
  targetNormals: Float32Array,
  vertexIndices: number[],
  originalNormalAttribute?: NumericBufferAttribute,
) {
  let fallbackX = 0
  let fallbackY = 0
  let fallbackZ = 0

  if (originalNormalAttribute?.itemSize && originalNormalAttribute.itemSize >= 3) {
    for (const vertexIndex of vertexIndices) {
      fallbackX += originalNormalAttribute.getX(vertexIndex)
      fallbackY += originalNormalAttribute.getY(vertexIndex)
      fallbackZ += originalNormalAttribute.getZ(vertexIndex)
    }
  }

  for (const vertexIndex of vertexIndices)
    writeNormalizedVector(targetNormals, vertexIndex, fallbackX, fallbackY, fallbackZ)
}

function buildWeldedVertexGroups(geometry: BufferGeometry) {
  const weldedVertexGroups = new Map<string, number[]>()
  const positionAttribute = geometry.getAttribute('position')

  for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++) {
    const key = [
      quantizePositionComponent(positionAttribute.getX(vertexIndex)),
      quantizePositionComponent(positionAttribute.getY(vertexIndex)),
      quantizePositionComponent(positionAttribute.getZ(vertexIndex)),
    ].join(':')
    const group = weldedVertexGroups.get(key) ?? []
    group.push(vertexIndex)
    weldedVertexGroups.set(key, group)
  }

  return weldedVertexGroups
}

function accumulateFaceNormals(geometry: BufferGeometry) {
  const positionAttribute = geometry.getAttribute('position')
  const indexAttribute = geometry.getIndex()
  const accumulatedNormals = new Float32Array(positionAttribute.count * 3)
  const triangleVertexCount = indexAttribute?.count ?? positionAttribute.count
  const triangleCount = Math.floor(triangleVertexCount / 3)

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const baseIndex = triangleIndex * 3
    const a = indexAttribute ? indexAttribute.getX(baseIndex) : baseIndex
    const b = indexAttribute ? indexAttribute.getX(baseIndex + 1) : baseIndex + 1
    const c = indexAttribute ? indexAttribute.getX(baseIndex + 2) : baseIndex + 2

    const ax = positionAttribute.getX(a)
    const ay = positionAttribute.getY(a)
    const az = positionAttribute.getZ(a)
    const bx = positionAttribute.getX(b)
    const by = positionAttribute.getY(b)
    const bz = positionAttribute.getZ(b)
    const cx = positionAttribute.getX(c)
    const cy = positionAttribute.getY(c)
    const cz = positionAttribute.getZ(c)

    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az

    const faceNormalX = aby * acz - abz * acy
    const faceNormalY = abz * acx - abx * acz
    const faceNormalZ = abx * acy - aby * acx

    if (!Number.isFinite(faceNormalX) || !Number.isFinite(faceNormalY) || !Number.isFinite(faceNormalZ))
      continue

    addFaceNormal(accumulatedNormals, a, faceNormalX, faceNormalY, faceNormalZ)
    addFaceNormal(accumulatedNormals, b, faceNormalX, faceNormalY, faceNormalZ)
    addFaceNormal(accumulatedNormals, c, faceNormalX, faceNormalY, faceNormalZ)
  }

  return accumulatedNormals
}

function ensureOutlineNormalAttribute(geometry: BufferGeometry) {
  if (isOutlineGeometryPreprocessed(geometry))
    return false

  const positionAttribute = geometry.getAttribute('position')
  if (!positionAttribute || positionAttribute.itemSize < 3)
    return false

  const weldedVertexGroups = buildWeldedVertexGroups(geometry)
  const accumulatedFaceNormals = accumulateFaceNormals(geometry)
  const originalNormalAttribute = geometry.getAttribute('normal')
  const outlineNormals = new Float32Array(positionAttribute.count * 3)

  for (const vertexIndices of weldedVertexGroups.values()) {
    let smoothX = 0
    let smoothY = 0
    let smoothZ = 0

    for (const vertexIndex of vertexIndices) {
      const base = vertexIndex * 3
      smoothX += accumulatedFaceNormals[base]
      smoothY += accumulatedFaceNormals[base + 1]
      smoothZ += accumulatedFaceNormals[base + 2]
    }

    if (smoothX * smoothX + smoothY * smoothY + smoothZ * smoothZ <= ZERO_VECTOR_EPSILON) {
      accumulateOriginalNormalFallback(outlineNormals, vertexIndices, originalNormalAttribute)
      continue
    }

    for (const vertexIndex of vertexIndices)
      writeNormalizedVector(outlineNormals, vertexIndex, smoothX, smoothY, smoothZ)
  }

  geometry.setAttribute(AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME, new Float32BufferAttribute(outlineNormals, 3))
  markOutlineGeometryPreprocessed(geometry)
  return true
}

// Built-in outline patch
function isOutlineMaterialPatched(material: Material) {
  return hasPatchedState(
    material,
    AIRI_OUTLINE_SHADER_PATCH_USER_DATA_KEY,
    AIRI_OUTLINE_SHADER_PATCH_VERSION,
    materialStateRegistry,
  )
}

function markOutlineMaterialPatched(material: Material) {
  markPatchedState(
    material,
    AIRI_OUTLINE_SHADER_PATCH_USER_DATA_KEY,
    AIRI_OUTLINE_SHADER_PATCH_VERSION,
    materialStateRegistry,
    { attribute: AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME },
  )
}

function injectOutlineNormalAttribute(vertexShader: string) {
  return vertexShader.replace(
    SHADER_COMMON_ANCHOR,
    `${SHADER_COMMON_ANCHOR}
attribute vec3 ${AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME};`,
  )
}

function replaceOutlineNormalSource(vertexShader: string) {
  return vertexShader.replace(
    SHADER_BEGINNORMAL_ANCHOR,
    `${SHADER_BEGINNORMAL_ANCHOR}
  objectNormal = ${AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME};`,
  )
}

function replaceOutlineExtrusionBlock(vertexShader: string) {
  return vertexShader.replace(
    SHADER_OUTLINE_BLOCK_ANCHOR,
    `  #ifdef OUTLINE
    float worldNormalLength = length( transformedNormal );
    float outlineWidth = outlineWidthFactor * worldNormalLength;

    #ifdef USE_OUTLINEWIDTHMULTIPLYTEXTURE
      vec2 outlineWidthMultiplyTextureUv = ( outlineWidthMultiplyTextureUvTransform * vec3( vUv, 1 ) ).xy;
      float outlineTex = texture2D( outlineWidthMultiplyTexture, outlineWidthMultiplyTextureUv ).g;
      outlineWidth *= outlineTex;
    #endif

    #ifdef OUTLINE_WIDTH_SCREEN
      outlineWidth *= vViewPosition.z / projectionMatrix[ 1 ].y;
    #endif

    vec3 outlineDirectionVS = normalize( normalMatrix * objectNormal );
    outlineDirectionVS.z = ${AIRI_OUTLINE_VIEW_FLATTENED_Z.toFixed(1)};
    outlineDirectionVS = normalize( outlineDirectionVS );

    vec4 outlinePositionVS = mvPosition;
    outlinePositionVS.xyz += outlineDirectionVS * outlineWidth;
    outlinePositionVS.z += ${AIRI_OUTLINE_VIEW_Z_OFFSET.toFixed(3)};

    gl_Position = projectionMatrix * outlinePositionVS;

    gl_Position.z += 1E-6 * gl_Position.w; // anti-artifact magic
  #endif`,
  )
}

function patchOutlineVertexShader(vertexShader: string) {
  const hasCommonAnchor = vertexShader.includes(SHADER_COMMON_ANCHOR)
  const hasBeginNormalAnchor = vertexShader.includes(SHADER_BEGINNORMAL_ANCHOR)
  const hasOutlineBlockAnchor = vertexShader.includes(SHADER_OUTLINE_BLOCK_ANCHOR)

  if (!hasCommonAnchor || !hasBeginNormalAnchor || !hasOutlineBlockAnchor)
    return undefined

  return replaceOutlineExtrusionBlock(
    replaceOutlineNormalSource(
      injectOutlineNormalAttribute(vertexShader),
    ),
  )
}

function patchBuiltInOutlineMaterial(material: MToonMaterial) {
  if (!material.isOutline || isOutlineMaterialPatched(material))
    return false

  const originalCustomProgramCacheKey = material.customProgramCacheKey.bind(material)
  const patchedVertexShader = patchOutlineVertexShader(material.vertexShader)

  if (!patchedVertexShader) {
    console.warn(
      '[AIRI] Failed to patch built-in MToon outline shader: expected shader anchors were not found.',
      material.name,
    )
    return false
  }

  // NOTICE: Three's WebGL program cache includes material.customProgramCacheKey().
  // We patch the outline vertex shader below, so the patched outline pass needs a distinct cache key.
  material.customProgramCacheKey = () => {
    const baseKey = originalCustomProgramCacheKey()

    return baseKey
      ? `${baseKey},${AIRI_OUTLINE_SHADER_PATCH_CACHE_KEY}`
      : AIRI_OUTLINE_SHADER_PATCH_CACHE_KEY
  }

  // NOTICE: @pixiv/three-vrm-materials-mtoon@3.5.1 hardcodes the MToon shader strings in
  // `lib/three-vrm-materials-mtoon.module.js`. The current patch depends on three stable anchors:
  // `#include <common>`, `#include <beginnormal_vertex>`, and the built-in outline block body.
  // We keep the original `onBeforeCompile` untouched so three-vrm can continue prepending its
  // define set; this patch only rewrites the stored vertex shader string and program cache key.
  material.vertexShader = patchedVertexShader
  material.needsUpdate = true
  markOutlineMaterialPatched(material)
  return true
}

function isMToonMaterial(material: Material): material is MToonMaterial {
  return (material as MToonMaterial).isMToonMaterial === true
}

function resolveBuiltInOutlineMeshTarget(mesh: Mesh): VrmOutlineMeshTarget | undefined {
  const materialOrMaterials = mesh.material
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials]
  let surfaceMaterialIndex = -1
  let builtInOutlineMaterialIndex = -1

  materials.forEach((material, materialIndex) => {
    if (!isMToonMaterial(material))
      return

    if (material.isOutline === true) {
      if (builtInOutlineMaterialIndex === -1)
        builtInOutlineMaterialIndex = materialIndex
      return
    }

    if (surfaceMaterialIndex === -1)
      surfaceMaterialIndex = materialIndex
  })

  if (surfaceMaterialIndex === -1 || builtInOutlineMaterialIndex === -1)
    return undefined

  return {
    builtInOutlineMaterial: materials[builtInOutlineMaterialIndex] as MToonMaterial,
    builtInOutlineMaterialIndex,
    geometry: mesh.geometry,
    mesh,
    surfaceMaterial: materials[surfaceMaterialIndex] as MToonMaterial,
    surfaceMaterialIndex,
  }
}

// Runtime target scan
function getVrmOutlineRuntimeState(vrm: VRM) {
  return vrmOutlineRuntimeRegistry.get(vrm)
}

function setVrmOutlineRuntimeState(vrm: VRM, state: VrmOutlineRuntimeState) {
  vrmOutlineRuntimeRegistry.set(vrm, state)
}

function clearVrmOutlineRuntime(vrm: VRM) {
  vrmOutlineRuntimeRegistry.delete(vrm)
}

function findVrmOutlineMeshTarget({
  material,
  materialIndex,
  mesh,
  vrm,
}: Pick<VrmMaterialHookContext, 'material' | 'materialIndex' | 'mesh' | 'vrm'>) {
  const runtimeState = getVrmOutlineRuntimeState(vrm)
  if (!runtimeState)
    return undefined

  return runtimeState.meshes.find(target =>
    target.mesh === mesh
    && target.surfaceMaterial === material
    && target.surfaceMaterialIndex === materialIndex,
  )
}

export function prepareVrmOutlineRuntime(vrm: VRM) {
  const meshTargets: VrmOutlineMeshTarget[] = []

  vrm.scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return
    }

    const meshTarget = resolveBuiltInOutlineMeshTarget(object)
    if (!meshTarget) {
      return
    }

    ensureOutlineNormalAttribute(meshTarget.geometry)
    meshTargets.push(meshTarget)
  })

  setVrmOutlineRuntimeState(vrm, { meshes: meshTargets })
}

export function disposeVrmOutlineRuntime(vrm?: VRM) {
  if (!vrm)
    return

  clearVrmOutlineRuntime(vrm)
}

export function createVrmOutlineHook(): VrmHook {
  return {
    onDispose({ vrm }) {
      disposeVrmOutlineRuntime(vrm)
    },
    onLoad({ vrm }) {
      prepareVrmOutlineRuntime(vrm)
    },
    onMaterial(context) {
      const { material } = context

      if (!isMToonMaterial(material) || material.isOutline === true)
        return

      const meshTarget = findVrmOutlineMeshTarget(context)
      if (!meshTarget)
        return

      if (!meshTarget.geometry.getAttribute(AIRI_OUTLINE_NORMAL_ATTRIBUTE_NAME)) {
        console.warn(
          '[AIRI] Failed to patch built-in MToon outline shader: outlineNormal is missing on geometry.',
          meshTarget.mesh.name,
        )
        return
      }

      patchBuiltInOutlineMaterial(meshTarget.builtInOutlineMaterial)
    },
  }
}
