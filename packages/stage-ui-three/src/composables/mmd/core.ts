import type { AnimationClip, Material, Mesh, Object3D, SkinnedMesh, Texture } from 'three'

import { buildAnimation, processBones } from '@moeru/three-mmd'
import {
  AnimationMixer,
  Box3,
  DoubleSide,
  Group,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js'

import { useMMDLoader, useVMDLoader } from './loader'

export interface MmdLoadResult {
  mmd: Awaited<ReturnType<ReturnType<typeof useMMDLoader>['loadAsync']>>
  mesh: SkinnedMesh
  mmdGroup: Group
  modelCenter: Vector3
  modelSize: Vector3
  initialCameraOffset: Vector3
  mixer?: AnimationMixer
  animationClip?: AnimationClip
  ikSolver?: CCDIKSolver
  ikEnabled?: boolean // true if animation uses IK mode, false for FK mode
}

// 判断材质类型的辅助函数
export function getMaterialType(matName: string): 'skin' | 'eye' | 'sock' | 'hair' | 'cloth' | 'other' {
  const name = matName.toLowerCase()

  // 输出调试信息
  console.log(`[MMD Material] Checking material: "${matName}" -> lowercase: "${name}"`)

  // 黑丝/袜子/靴子/鞋子 - 最高优先级，避免被其他规则误匹配
  // 包括：日语（靴、袜）、中文（袜子、靴子、丝袜、黑丝）、英文（sock, stocking, pantyhose, boot, shoe）
  // 还包括常见的缩写和变体：hs（黑丝）、tights、legwear
  if (name.includes('靴') || name.includes('袜') || name.includes('袜子') || name.includes('靴子')
    || name.includes('丝袜') || name.includes('黑丝') || name.includes('hs')
    || name.includes('sock') || name.includes('stocking') || name.includes('pantyhose')
    || name.includes('boot') || name.includes('shoe') || name.includes('tights')
    || name.includes('legwear') || name.includes('ニーソ') || name.includes('ニソ')
    || name.includes('鞋')) {
    console.log(`[MMD Material] "${matName}" classified as: sock`)
    return 'sock'
  }

  // 眼睛 - 真正的眼睛部位
  // 排除：神之眼等装饰物（含"神"）
  // 包括：白目、目光、目（单独）、瞳、睛、星目、眼球、眼白、eyeball、eye、iris、pupil、sclera
  const isDecoration = name.includes('神') || name.includes('饰品') || name.includes('装饰')
  const isEyePart = name.includes('白目') || name.includes('目光') || name === '目'
    || name.includes('星目') || name.includes('瞳') || name.includes('睛')
    || name.includes('眼球') || name.includes('眼白')
    || name.includes('eyeball') || name.includes('iris') || name.includes('pupil') || name.includes('sclera')
    || name.includes('whites')

  if (isEyePart && !isDecoration) {
    console.log(`[MMD Material] "${matName}" classified as: eye`)
    return 'eye'
  }

  // 头发 - 日语（髪）、中文（头发）、英文（hair, feather）
  // 包括：睫毛（睫）、眉毛（眉）
  if (name.includes('髪') || name.includes('发') || name.includes('头发')
    || name.includes('hair') || name.includes('feather')
    || name.includes('睫') || name.includes('眉')) {
    console.log(`[MMD Material] "${matName}" classified as: hair`)
    return 'hair'
  }

  // 手指/手/指甲
  if (name.includes('指甲') || name === '甲' || name.includes('手指')
    || name.includes('hand') || name.includes('finger') || name.includes('nail')
    || name.includes('hand_skin') || name.includes('finger_skin')) {
    console.log(`[MMD Material] "${matName}" classified as: skin (hand/finger)`)
    return 'skin'
  }

  // 足部/脚趾
  if (name.includes('足') || name.includes('脚') || name.includes('foot') || name.includes('toe')) {
    console.log(`[MMD Material] "${matName}" classified as: skin (foot)`)
    return 'skin'
  }

  // 皮肤/脸部
  // 包括：颜（脸）、肌、肤、皮肤、skin、body、face、leg、thigh、arm等
  if (name.includes('颜') || name === '顔' || name.includes('肌') || name.includes('肤') || name.includes('皮肤')
    || name.includes('skin') || name.includes('body') || name.includes('face')
    || name.includes('leg') || name.includes('thigh') || name.includes('arm')
    || name.includes('chest') || name.includes('abdomen') || name.includes('胸')
    || name.includes('腹') || name.includes('臂') || name.includes('腿')) {
    console.log(`[MMD Material] "${matName}" classified as: skin`)
    return 'skin'
  }

  // 衣服
  if (name.includes('服') || name.includes('衣') || name.includes(' dress') || name.includes('cloth')
    || name.includes('skirt') || name.includes('coat') || name.includes('裤') || name.includes('裙')
    || name.includes('shirt') || name.includes('jacket') || name.includes('top') || name.includes('bottom')
    || name.includes('袖') || name.includes('首') || name.includes('体')) {
    console.log(`[MMD Material] "${matName}" classified as: cloth`)
    return 'cloth'
  }

  console.log(`[MMD Material] "${matName}" classified as: other`)
  return 'other'
}

// 配置材质
function configureMaterial(mat: Material, index: number, matName: string): void {
  const materialType = getMaterialType(matName)

  // 获取原始材质属性
  const originalOpacity = 'opacity' in mat ? (mat as { opacity?: number }).opacity : undefined
  const originalTransparent = 'transparent' in mat ? (mat as { transparent?: boolean }).transparent : undefined
  const texMap = 'map' in mat ? (mat as { map?: Texture }).map : undefined
  const hasTexture = texMap !== null && texMap !== undefined

  // 输出材质属性调试信息（包括纹理详情）
  console.log(`[MMD Material Config] "${matName}" (${materialType}):`, {
    originalOpacity,
    originalTransparent,
    hasTexture,
    textureName: texMap?.name || 'none',
    textureImage: texMap?.image ? ((texMap.image as HTMLImageElement)?.src?.substring(0, 80) || 'loaded') : 'none',
    side: mat.side,
    depthWrite: mat.depthWrite,
  })

  // 统一设置颜色空间
  if ('colorSpace' in mat) {
    (mat as { colorSpace: string }).colorSpace = SRGBColorSpace
  }

  // 根据材质类型进行特殊处理
  switch (materialType) {
    case 'sock': // 黑丝/袜子
      // 黑丝需要保持透明效果和原始颜色
      // 关键：保持原始透明度设置，但确保深度写入以防止透明问题
      mat.side = DoubleSide
      mat.depthWrite = true
      mat.depthTest = true
      if ('depthFunc' in mat) {
        (mat as { depthFunc: number }).depthFunc = 513
      }
      // 黑丝通常需要一定透明度，保留原始设置
      if (originalTransparent !== undefined && originalTransparent === true) {
        mat.transparent = true
        // 如果原始透明度值存在，保留它；否则使用一个合理的默认值
        mat.opacity = originalOpacity ?? 0.9
      }
      else {
        // 如果原本不是透明的，确保能显示
        mat.transparent = false
        mat.opacity = 1
      }
      mat.needsUpdate = true
      if ('renderOrder' in mat) {
        (mat as { renderOrder: number }).renderOrder = index + 10 // 稍后渲染
      }
      console.log(`[MMD Material Config] "${matName}" sock applied: transparent=${mat.transparent}, opacity=${mat.opacity}`)
      break

    case 'eye': // 眼睛
      // 眼睛需要保持原始颜色和纹理
      mat.side = DoubleSide
      mat.depthWrite = true
      mat.depthTest = true
      // 眼睛通常不需要透明，除非原始设置就是透明的
      if (originalTransparent !== undefined) {
        mat.transparent = originalTransparent
      }
      else {
        mat.transparent = false // 眼睛通常不透明
      }
      if (originalOpacity !== undefined) {
        mat.opacity = originalOpacity
      }
      else {
        mat.opacity = 1
      }
      mat.needsUpdate = true
      if ('renderOrder' in mat) {
        (mat as { renderOrder: number }).renderOrder = index + 5 // 中等渲染顺序
      }
      // 眼睛不转换颜色空间，保持原始颜色
      console.log(`[MMD Material Config] "${matName}" eye applied: transparent=${mat.transparent}, opacity=${mat.opacity}`)
      break

    case 'skin': // 皮肤/手指
      // 皮肤保持原始颜色
      mat.side = DoubleSide
      mat.transparent = false
      mat.opacity = 1
      mat.depthWrite = true
      mat.depthTest = true
      if ('depthFunc' in mat) {
        (mat as { depthFunc: number }).depthFunc = 513
      }
      mat.needsUpdate = true
      if ('renderOrder' in mat) {
        (mat as { renderOrder: number }).renderOrder = index
      }
      console.log(`[MMD Material Config] "${matName}" skin applied`)
      break

    case 'hair': // 头发
    case 'cloth': // 衣服
    default:
      // 其他材质保持原始设置
      mat.side = DoubleSide
      if (originalTransparent !== undefined) {
        mat.transparent = originalTransparent
      }
      mat.depthWrite = true
      mat.depthTest = true
      if ('depthFunc' in mat) {
        (mat as { depthFunc: number }).depthFunc = 513
      }
      mat.needsUpdate = true
      if ('renderOrder' in mat) {
        (mat as { renderOrder: number }).renderOrder = index
      }
      console.log(`[MMD Material Config] "${matName}" ${materialType} applied`)
      break
  }

  // 处理纹理
  if (texMap && 'colorSpace' in texMap) {
    (texMap as { colorSpace: string }).colorSpace = SRGBColorSpace
    texMap.needsUpdate = true
  }

  // 处理其他纹理贴图
  const mapKeys = ['alphaMap', 'emissiveMap', 'lightMap', 'bumpMap', 'normalMap', 'specularMap']
  mapKeys.forEach((mapKey) => {
    const tex = (mat as unknown as Record<string, unknown>)[mapKey] as Texture | undefined
    if (tex && 'colorSpace' in tex) {
      (tex as { colorSpace: string }).colorSpace = SRGBColorSpace
      tex.needsUpdate = true
    }
  })
}

export async function loadMmd(
  modelUrl: string,
  options?: {
    scene?: Object3D
    vmdUrl?: string
    onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
  },
): Promise<MmdLoadResult | undefined> {
  const mmdLoader = useMMDLoader()
  const vmdLoader = useVMDLoader()

  // Load PMX/PMD model
  const mmd = await mmdLoader.loadAsync(modelUrl, (progress: unknown) => options?.onProgress?.(progress as ProgressEvent<EventTarget>))

  if (!mmd?.mesh) {
    console.error('Failed to load MMD model')
    return undefined
  }

  const mesh = mmd.mesh

  console.log('[MMD Load] Mesh type:', mesh.constructor.name, 'isSkinnedMesh:', mesh.isSkinnedMesh)
  console.log('[MMD Load] Mesh children:', mesh.children?.length)
  console.log('[MMD Load] Mesh skeleton:', !!mesh.skeleton, 'bones:', mesh.skeleton?.bones?.length)

  // Force update the mesh to ensure all changes take effect
  mesh.updateMatrixWorld(true)
  mesh.geometry.attributes.position.needsUpdate = true

  // Bind skeleton
  if (mesh.skeleton) {
    mesh.bind(mesh.skeleton)
  }

  // Disable frustum culling for the main mesh
  mesh.frustumCulled = false

  // Also disable frustum culling for all child meshes
  mesh.traverse((obj: Object3D) => {
    const childMesh = obj as SkinnedMesh
    if (childMesh.isMesh) {
      childMesh.frustumCulled = false
    }
  })

  // Create a group to hold the model
  const mmdGroup = new Group()
  mmdGroup.add(mesh)

  // Set render order on the mesh for proper rendering
  mesh.renderOrder = 0

  // Disable frustum culling for the group
  mmdGroup.frustumCulled = false

  // 配置材质 - 使用新的 configureMaterial 函数处理不同类型的材质
  // Fix the main mesh material directly
  if (mesh.material) {
    const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    matList.forEach((mat, index) => {
      if (!mat)
        return
      const matName = mat.name || ''
      configureMaterial(mat, index, matName)
    })
  }

  // Also fix child mesh materials
  mesh.traverse((obj: Object3D) => {
    const meshObj = obj as Mesh
    if (!meshObj.isMesh)
      return

    const materials = meshObj.material
    if (!materials)
      return

    const matList = Array.isArray(materials) ? materials : [materials]
    matList.forEach((mat, index) => {
      if (!mat)
        return
      const matName = mat.name || ''
      configureMaterial(mat, index, matName)
    })
  })
  // Debug: log skeleton info
  if (mesh.skeleton) {
    // Process bones to initialize them properly
    processBones(mesh.skeleton.bones)

    // Store initial bone transforms (bind pose)
    mesh.skeleton.bones.forEach((bone) => {
      bone.position.copy(bone.position)
      bone.quaternion.copy(bone.quaternion)
      bone.scale.copy(bone.scale)
    })

    // Update skeleton
    mesh.skeleton.update()
    mesh.skeleton.computeBoneTexture()
  }

  // Add to scene if provided
  if (options?.scene) {
    options.scene.add(mmdGroup)

    // Also add skeleton helper bones to scene for debugging if needed
    if (mesh.skeleton) {
      // Ensure bones are in the scene for proper skinned mesh rendering
      mesh.skeleton.bones.forEach((bone) => {
        if (!bone.parent) {
          mmdGroup.add(bone)
        }
      })
    }
  }

  // Compute bounding box
  const box = new Box3()
  mesh.updateMatrixWorld(true)

  mesh.traverse((obj: Object3D) => {
    if (!obj.visible)
      return
    const childMesh = obj as SkinnedMesh
    if (!childMesh.isMesh)
      return
    if (!childMesh.geometry)
      return

    if (!childMesh.geometry.boundingBox) {
      childMesh.geometry.computeBoundingBox()
    }

    const childBox = new Box3()
    childBox.copy(childMesh.geometry.boundingBox!)
    childBox.applyMatrix4(childMesh.matrixWorld)

    box.union(childBox)
  })

  const modelSize = new Vector3()
  const modelCenter = new Vector3()
  box.getSize(modelSize)
  box.getCenter(modelCenter)

  // No offset - use actual model center
  const finalModelCenter = modelCenter.clone()

  // Compute the initial camera position
  // Adjust distance to see the full model
  const fov = 40
  const halfFovRad = (fov / 2) * Math.PI / 180
  const distance = modelSize.y / (2 * Math.tan(halfFovRad)) * 1.5 // 1.5x to see full height with margin

  const initialCameraOffset = new Vector3(
    0,
    modelSize.y * 0.5, // Look at middle of model
    distance,
  )

  const result: MmdLoadResult = {
    mmd,
    mesh,
    mmdGroup,
    modelCenter: finalModelCenter,
    modelSize,
    initialCameraOffset,
  }

  // Create IK solver if IK data is available
  if (mmd.iks && mmd.iks.length > 0) {
    try {
      const ikSolver = new CCDIKSolver(mesh, mmd.iks)
      result.ikSolver = ikSolver
      console.log(`[MMD IK] IK solver created with ${mmd.iks.length} chains`)
    }
    catch (err) {
      console.warn('[MMD IK] Failed to create IK solver:', err)
    }
  }

  // Store IK enabled state (will be set after VMD loading)
  result.ikEnabled = false

  // Load VMD animation if provided
  if (options?.vmdUrl) {
    try {
      const vmd = await vmdLoader.loadAsync(options.vmdUrl)

      const animationClip = buildAnimation(vmd, mesh)

      // Check IK bone position tracks - IK mode uses IK target positions
      const ikBoneNames = ['左足ＩＫ', '右足ＩＫ', '左つま先ＩＫ', '右つま先ＩＫ']
      const ikPositionTracks = animationClip.tracks?.filter((track: any) =>
        track.name?.includes('.quaternion') === false
        && ikBoneNames.some(name => track.name?.includes(name)),
      )

      // Check leg bone quaternion tracks - FK mode uses direct bone rotation
      const legBoneNames = ['左ひざ', '右ひざ']
      const legQuaternionTracks = animationClip.tracks?.filter((track: any) =>
        track.name?.includes('.quaternion')
        && legBoneNames.some(name => track.name?.includes(name)),
      )

      // Determine IK/FK mode:
      // IK mode: IK bones have position animation (>10 frames), knee quaternions from IK solver
      // FK mode: Knee bones have quaternion animation (>10 frames), IK bones static
      const ikFrameThreshold = 10
      const hasIkPositionAnimation = ikPositionTracks?.some((t: any) => t.times?.length > ikFrameThreshold) ?? false
      const hasKneeQuaternionAnimation = legQuaternionTracks?.some((t: any) => t.times?.length > ikFrameThreshold) ?? false

      if (hasIkPositionAnimation && !hasKneeQuaternionAnimation) {
        result.ikEnabled = true
        console.log('[MMD VMD] IK mode detected: enabling IK solver')
      }
      else if (hasKneeQuaternionAnimation && !hasIkPositionAnimation) {
        result.ikEnabled = false
        console.log('[MMD VMD] FK mode detected: disabling IK solver')
      }
      else if (hasIkPositionAnimation && hasKneeQuaternionAnimation) {
        result.ikEnabled = true
        console.log('[MMD VMD] Hybrid mode: enabling IK solver')
      }
      else {
        result.ikEnabled = false
        console.log('[MMD VMD] No leg animation detected')
      }

      const mixer = new AnimationMixer(mesh)
      const action = mixer.clipAction(animationClip)
      action.play()

      result.mixer = mixer
      result.animationClip = animationClip
    }
    catch (err) {
      console.warn('Failed to load VMD animation:', err)
    }
  }

  return result
}
