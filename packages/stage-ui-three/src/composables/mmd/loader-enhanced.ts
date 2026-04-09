import type { AnimationClip, Bone, BufferGeometry, Material, SkinnedMesh, Texture, Vector3 } from 'three'

import { buildAnimation, processBones } from '@moeru/three-mmd'
import { AnimationMixer, Bone as BoneClass, Box3, BufferGeometry as BufferGeometryClass, DoubleSide, Float32BufferAttribute, Group, MeshToonMaterial, Skeleton as SkeletonClass, SkinnedMesh as SkinnedMeshClass, SRGBColorSpace, TextureLoader, Uint16BufferAttribute, Vector3 as Vector3Class } from 'three'

import { registerMmdTextures, unregisterMmdTextures, useMMDLoader, useVMDLoader } from './loader'

// MMD模型数据接口
export interface MMDModelData {
  mmd: Awaited<ReturnType<ReturnType<typeof useMMDLoader>['loadAsync']>>
  mesh: SkinnedMesh
  materials: Material[]
  textures: Texture[]
  bones: Bone[]
}

// 加载结果接口
export interface MmdLoadResult {
  mmd: Awaited<ReturnType<ReturnType<typeof useMMDLoader>['loadAsync']>>
  mesh: SkinnedMesh
  mmdGroup: Group
  modelCenter: Vector3
  modelSize: Vector3
  initialCameraOffset: Vector3
  mixer?: AnimationMixer
  animationClip?: AnimationClip
}

// 缓存机制
const mmdCache = new Map<string, MMDModelData>()
const resultCache = new Map<string, MmdLoadResult>()

/**
 * 检查模型是否已缓存
 */
export function isMmdCached(modelUrl: string): boolean {
  return mmdCache.has(modelUrl)
}

/**
 * 从缓存获取模型数据
 */
export function getCachedMmd(modelUrl: string): MMDModelData | undefined {
  return mmdCache.get(modelUrl)
}

/**
 * 清除指定模型的缓存
 */
export function clearMmdCache(modelUrl?: string): void {
  if (modelUrl) {
    const cached = mmdCache.get(modelUrl)
    if (cached) {
      disposeMmdModelData(cached)
      mmdCache.delete(modelUrl)
      resultCache.delete(modelUrl)
    }
  }
  else {
    // 清除所有缓存
    mmdCache.forEach(data => disposeMmdModelData(data))
    mmdCache.clear()
    resultCache.clear()
  }
}

/**
 * 释放模型数据资源
 */
function disposeMmdModelData(data: MMDModelData): void {
  // 清理几何体
  if (data.mesh.geometry) {
    data.mesh.geometry.dispose()
  }

  // 清理材质
  const materials = Array.isArray(data.mesh.material) ? data.mesh.material : [data.mesh.material]
  materials.forEach((material) => {
    if (material) {
      const mat = material as unknown as Record<string, unknown>
      if (mat.map && typeof mat.map === 'object' && 'dispose' in mat.map) {
        (mat.map as { dispose: () => void }).dispose()
      }
      if ('dispose' in material) {
        material.dispose()
      }
    }
  })

  // 清理纹理
  data.textures.forEach(texture => texture.dispose())
}

/**
 * 获取缓存大小
 */
export function getMmdCacheSize(): number {
  return mmdCache.size
}

/**
 * 加载纹理
 */
export async function loadMmdTexture(texturePath: string): Promise<Texture | null> {
  const loader = new TextureLoader()

  return new Promise((resolve) => {
    loader.load(
      texturePath,
      (texture) => {
        texture.colorSpace = SRGBColorSpace
        texture.flipY = false // MMD纹理不需要翻转
        resolve(texture)
      },
      undefined,
      () => {
        console.warn(`Failed to load texture: ${texturePath}`)
        resolve(null)
      },
    )
  })
}

/**
 * 创建人形占位模型
 * 当真实的MMD加载失败时使用
 */
function createPlaceholderModel(): {
  mesh: SkinnedMesh
  materials: Material[]
  textures: Texture[]
  bones: Bone[]
} {
  // 创建一个简单的人形几何体
  const geometry = createHumanoidGeometry()

  // 创建材质 - 紫色卡通材质
  const material = new MeshToonMaterial({
    color: 0x9B59B6,
    side: DoubleSide,
  })

  // 创建骨骼
  const bones = createHumanoidBones()
  const skeleton = new SkeletonClass(bones)

  // 创建骨骼网格
  const mesh = new SkinnedMeshClass(geometry, material)
  mesh.add(bones[0]) // 添加根骨骼
  mesh.bind(skeleton)
  mesh.castShadow = true
  mesh.receiveShadow = true

  return {
    mesh,
    materials: [material],
    textures: [],
    bones,
  }
}

/**
 * 创建人形几何体
 */
function createHumanoidGeometry(): BufferGeometry {
  const geometry = new BufferGeometryClass()

  // 简单的人形顶点数据（胶囊形状）
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const skinIndices: number[] = []
  const skinWeights: number[] = []

  // 头部
  const headRadius = 0.12
  const headSegments = 16
  const headY = 1.4
  for (let lat = 0; lat <= headSegments; lat++) {
    const theta = (lat * Math.PI) / headSegments
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)

    for (let lon = 0; lon <= headSegments; lon++) {
      const phi = (lon * 2 * Math.PI) / headSegments
      const sinPhi = Math.sin(phi)
      const cosPhi = Math.cos(phi)

      const x = cosPhi * sinTheta
      const y = cosTheta
      const z = sinPhi * sinTheta

      positions.push(x * headRadius, y * headRadius + headY, z * headRadius)
      normals.push(x, y, z)
      uvs.push(lon / headSegments, lat / headSegments)

      // 头部骨骼权重
      skinIndices.push(1, 0, 0, 0)
      skinWeights.push(1, 0, 0, 0)
    }
  }

  // 身体（圆柱体）
  const bodyRadius = 0.15
  const bodyHeight = 0.6
  const bodyY = 0.8
  const bodySegments = 12

  for (let lat = 0; lat <= bodySegments; lat++) {
    const y = 1 - (lat / bodySegments) * 2
    const radius = bodyRadius * (1 - Math.abs(y) * 0.3)

    for (let lon = 0; lon <= bodySegments; lon++) {
      const theta = (lon / bodySegments) * Math.PI * 2

      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius

      positions.push(x, y * bodyHeight + bodyY, z)
      normals.push(Math.cos(theta), 0, Math.sin(theta))
      uvs.push(lon / bodySegments, lat / bodySegments)

      // 身体骨骼权重 - 根据高度分配
      if (y > 0) {
        skinIndices.push(2, 0, 0, 0)
        skinWeights.push(1, 0, 0, 0)
      }
      else {
        skinIndices.push(0, 2, 0, 0)
        skinWeights.push(0.5, 0.5, 0, 0)
      }
    }
  }

  // 构建索引
  const indices: number[] = []

  // 头部索引
  for (let lat = 0; lat < headSegments; lat++) {
    for (let lon = 0; lon < headSegments; lon++) {
      const first = lat * (headSegments + 1) + lon
      const second = first + headSegments + 1

      indices.push(first, second, first + 1)
      indices.push(second, second + 1, first + 1)
    }
  }

  // 身体索引
  const bodyOffset = (headSegments + 1) * (headSegments + 1)
  for (let lat = 0; lat < bodySegments; lat++) {
    for (let lon = 0; lon < bodySegments; lon++) {
      const first = bodyOffset + lat * (bodySegments + 1) + lon
      const second = first + bodySegments + 1

      indices.push(first, second, first + 1)
      indices.push(second, second + 1, first + 1)
    }
  }

  geometry.setIndex(indices)
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4))

  geometry.computeBoundingBox()

  return geometry
}

/**
 * 创建人形骨骼
 */
function createHumanoidBones(): Bone[] {
  const bones: Bone[] = []

  // 根骨骼
  const root = new BoneClass()
  root.name = 'root'
  root.position.set(0, 0, 0)
  bones.push(root)

  // 盆骨
  const hips = new BoneClass()
  hips.name = 'hips'
  hips.position.set(0, 0.5, 0)
  root.add(hips)
  bones.push(hips)

  // 脊柱
  const spine = new BoneClass()
  spine.name = 'spine'
  spine.position.set(0, 0.3, 0)
  hips.add(spine)
  bones.push(spine)

  // 胸部
  const chest = new BoneClass()
  chest.name = 'chest'
  chest.position.set(0, 0.3, 0)
  spine.add(chest)
  bones.push(chest)

  // 颈部
  const neck = new BoneClass()
  neck.name = 'neck'
  neck.position.set(0, 0.2, 0)
  chest.add(neck)
  bones.push(neck)

  // 头部
  const head = new BoneClass()
  head.name = 'head'
  head.position.set(0, 0.15, 0)
  neck.add(head)
  bones.push(head)

  return bones
}

/**
 * 配置材质属性
 */
function configureMaterial(material: Material, index: number): void {
  const mat = material as unknown as Record<string, unknown>

  // 设置颜色空间
  if ('colorSpace' in mat) {
    mat.colorSpace = SRGBColorSpace
  }
  material.side = DoubleSide
  material.transparent = false
  material.opacity = 1
  material.depthWrite = true
  material.depthTest = true
  if ('depthFunc' in mat) {
    mat.depthFunc = 513 // THREE.LessEqual
  }
  material.needsUpdate = true
  if ('renderOrder' in mat) {
    mat.renderOrder = index
  }

  // 处理纹理
  const texMap = mat.map as Texture | undefined
  if (texMap) {
    texMap.colorSpace = SRGBColorSpace
    texMap.needsUpdate = true
  }

  const mapKeys = ['alphaMap', 'emissiveMap', 'lightMap', 'bumpMap', 'normalMap', 'specularMap']
  mapKeys.forEach((mapKey) => {
    const tex = mat[mapKey] as Texture | undefined
    if (tex) {
      tex.colorSpace = SRGBColorSpace
      tex.needsUpdate = true
    }
  })
}

/**
 * 配置网格和材质
 */
function configureMesh(mesh: SkinnedMesh): void {
  // 强制更新网格
  mesh.updateMatrixWorld(true)
  mesh.geometry.attributes.position.needsUpdate = true

  // 绑定骨架
  if (mesh.skeleton) {
    mesh.bind(mesh.skeleton)
  }

  // 禁用视锥体剔除
  mesh.frustumCulled = false

  mesh.traverse((obj) => {
    if ((obj as SkinnedMesh).isMesh) {
      obj.frustumCulled = false
    }
  })

  // 设置材质属性
  if (mesh.material) {
    const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    matList.forEach((mat, index) => {
      if (mat) {
        configureMaterial(mat, index)
      }
    })
  }

  // 处理骨骼
  if (mesh.skeleton) {
    processBones(mesh.skeleton.bones)

    mesh.skeleton.bones.forEach((bone) => {
      bone.position.copy(bone.position)
      bone.quaternion.copy(bone.quaternion)
      bone.scale.copy(bone.scale)
    })

    mesh.skeleton.update()
    mesh.skeleton.computeBoneTexture()
  }
}

/**
 * 计算模型包围盒和初始相机位置
 */
function computeModelMetrics(mesh: SkinnedMesh): {
  modelCenter: Vector3
  modelSize: Vector3
  initialCameraOffset: Vector3
} {
  const box = new Box3()
  mesh.updateMatrixWorld(true)

  mesh.traverse((obj) => {
    if (!obj.visible)
      return
    const childMesh = obj as SkinnedMesh
    if (!childMesh.isMesh || !childMesh.geometry)
      return

    if (!childMesh.geometry.boundingBox) {
      childMesh.geometry.computeBoundingBox()
    }

    const childBox = new Box3()
    childBox.copy(childMesh.geometry.boundingBox!)
    childBox.applyMatrix4(childMesh.matrixWorld)

    box.union(childBox)
  })

  const modelSize = new Vector3Class()
  const modelCenter = new Vector3Class()
  box.getSize(modelSize)
  box.getCenter(modelCenter)

  // 计算初始相机位置
  const fov = 40
  const halfFovRad = (fov / 2) * Math.PI / 180
  const distance = modelSize.y / (2 * Math.tan(halfFovRad)) * 1.5

  const initialCameraOffset = new Vector3Class(
    0,
    modelSize.y * 0.5,
    distance,
  )

  return { modelCenter, modelSize, initialCameraOffset }
}

/**
 * 加载MMD模型
 * 支持缓存、占位模型和ZIP加载
 */
export async function loadMmd(
  modelUrl: string,
  options?: {
    scene?: import('three').Object3D
    vmdUrl?: string
    textures?: Map<string, string>
    onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
    useCache?: boolean
    usePlaceholder?: boolean
  },
): Promise<MmdLoadResult | undefined> {
  const {
    scene,
    vmdUrl,
    textures,
    onProgress,
    useCache = true,
    usePlaceholder = true,
  } = options || {}

  // 注册纹理
  if (textures) {
    registerMmdTextures(textures)
  }

  const mmdLoader = useMMDLoader()
  const vmdLoader = useVMDLoader()

  // 尝试加载模型
  let mmd: Awaited<ReturnType<typeof mmdLoader.loadAsync>> | undefined

  try {
    mmd = await mmdLoader.loadAsync(modelUrl, (progress: unknown) => onProgress?.(progress as ProgressEvent<EventTarget>))
  }
  catch (error) {
    console.error('Failed to load MMD model:', error)
  }

  // 如果加载失败且启用占位模型
  if (!mmd?.mesh && usePlaceholder) {
    console.warn('Creating placeholder model...')
    const placeholder = createPlaceholderModel()

    // 创建虚拟的mmd对象结构
    mmd = {
      mesh: placeholder.mesh,
      grants: [],
      iks: [],
    } as Awaited<ReturnType<typeof mmdLoader.loadAsync>>

    // 缓存占位模型数据
    const modelData: MMDModelData = {
      mmd: mmd!,
      mesh: placeholder.mesh,
      materials: placeholder.materials,
      textures: placeholder.textures,
      bones: placeholder.bones,
    }

    if (useCache) {
      mmdCache.set(modelUrl, modelData)
    }

    // 配置网格
    configureMesh(placeholder.mesh)

    // 创建组
    const mmdGroup = new Group()
    mmdGroup.add(placeholder.mesh)
    mmdGroup.frustumCulled = false
    placeholder.mesh.renderOrder = 0

    // 添加到场景
    if (scene) {
      scene.add(mmdGroup)
    }

    // 计算模型指标
    const metrics = computeModelMetrics(placeholder.mesh)

    const result: MmdLoadResult = {
      mmd: mmd!,
      mesh: placeholder.mesh,
      mmdGroup,
      ...metrics,
    }

    if (useCache) {
      resultCache.set(modelUrl, result)
    }

    // 取消注册纹理
    if (textures) {
      unregisterMmdTextures(textures)
    }

    return result
  }

  // 正常加载流程
  if (!mmd?.mesh) {
    console.error('Failed to load MMD model')
    if (textures) {
      unregisterMmdTextures(textures)
    }
    return undefined
  }

  const mesh = mmd.mesh

  // 配置网格
  configureMesh(mesh)

  // 创建组
  const mmdGroup = new Group()
  mmdGroup.add(mesh)
  mesh.renderOrder = 0
  mmdGroup.frustumCulled = false

  // 添加到场景
  if (scene) {
    scene.add(mmdGroup)

    // 添加骨骼到场景
    if (mesh.skeleton) {
      mesh.skeleton.bones.forEach((bone) => {
        if (!bone.parent) {
          mmdGroup.add(bone)
        }
      })
    }
  }

  // 计算模型指标
  const metrics = computeModelMetrics(mesh)

  // 收集模型数据用于缓存
  const materials: Material[] = []
  const texturesList: Texture[] = []

  if (mesh.material) {
    const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.push(...matList)

    matList.forEach((mat) => {
      const matRecord = mat as unknown as Record<string, unknown>
      const texMap = matRecord.map as Texture | undefined
      if (texMap)
        texturesList.push(texMap)
    })
  }

  const modelData: MMDModelData = {
    mmd,
    mesh,
    materials,
    textures: texturesList,
    bones: mesh.skeleton?.bones || [],
  }

  // 缓存模型数据
  if (useCache) {
    mmdCache.set(modelUrl, modelData)
  }

  const result: MmdLoadResult = {
    mmd,
    mesh,
    mmdGroup,
    ...metrics,
  }

  // 加载VMD动画
  if (vmdUrl) {
    try {
      const vmd = await vmdLoader.loadAsync(vmdUrl)
      const animationClip = buildAnimation(vmd, mesh)

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

  // 缓存结果
  if (useCache) {
    resultCache.set(modelUrl, result)
  }

  // 取消注册纹理
  if (textures) {
    unregisterMmdTextures(textures)
  }

  return result
}

/**
 * 清理MMD加载结果资源
 */
export function disposeMmdResult(result: MmdLoadResult): void {
  // 清理动画混合器
  if (result.mixer) {
    result.mixer.stopAllAction()
    result.mixer.uncacheRoot(result.mixer.getRoot())
  }

  // 清理动画剪辑
  if (result.animationClip && 'dispose' in result.animationClip) {
    (result.animationClip as { dispose: () => void }).dispose()
  }

  // 清理网格
  if (result.mesh) {
    result.mesh.traverse((child) => {
      if ((child as SkinnedMesh).isMesh) {
        const mesh = child as SkinnedMesh
        if (mesh.geometry && 'dispose' in mesh.geometry) {
          mesh.geometry.dispose()
        }
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const mat of materials) {
            if (mat) {
              const matRecord = mat as unknown as Record<string, unknown>
              const texMap = matRecord.map as Texture | undefined
              if (texMap && 'dispose' in texMap) {
                texMap.dispose()
              }
              if ('dispose' in mat) {
                mat.dispose()
              }
            }
          }
        }
      }
    })
  }

  // 从场景移除
  if (result.mmdGroup.parent) {
    result.mmdGroup.parent.remove(result.mmdGroup)
  }
}
