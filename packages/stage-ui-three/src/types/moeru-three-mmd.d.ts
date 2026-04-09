declare module '@moeru/three-mmd' {
  import type {
    AnimationClip,
    Bone,
    BufferGeometry,
    Loader,
    LoadingManager,
    MaterialParameters,
    Quaternion,
    ShaderMaterial,
    SkinnedMesh,
    TextureLoader,
  } from 'three'
  import type { TGALoader } from 'three/addons/loaders/TGALoader.js'
  import type { IK } from 'three/examples/jsm/animation/CCDIKSolver.js'

  export interface Grant {
    // grant properties
  }

  export type GrantSolver = unknown

  export interface MMD {
    grants: Grant[]
    iks: IK[]
    mesh: SkinnedMesh
  }

  export interface MMDLoaderDeps {
    AnimationClip: typeof AnimationClip
    Bone: typeof Bone
    BufferGeometry: typeof BufferGeometry
    IK: typeof IK
    Loader: typeof Loader
    LoadingManager: typeof LoadingManager
    MaterialParameters: typeof MaterialParameters
    Quaternion: typeof Quaternion
    ShaderMaterial: typeof ShaderMaterial
    SkinnedMesh: typeof SkinnedMesh
    TGALoader: typeof TGALoader
    TextureLoader: typeof TextureLoader
  }

  export type MMDLoaderPlugin = (deps: MMDLoaderDeps) => Partial<MMDLoaderDeps>

  export declare class MMDLoader extends Loader<MMD> {
    constructor(plugins?: MMDLoaderPlugin[], manager?: LoadingManager)
    load(url: string, onLoad: (mesh: MMD) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: unknown) => void): void
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<MMD>
    register(plugin: MMDLoaderPlugin): this
  }

  export interface MMDMeshLoader {
    load(url: string, onLoad: (mesh: SkinnedMesh) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: unknown) => void): void
  }

  export interface PhysicsFactory {
    // physics factory properties
  }

  export interface PhysicsService {
    // physics service properties
  }

  export interface PmxObject {
    header: unknown
    vertices: unknown[]
    indices: Uint8Array | Uint16Array | Int32Array
    textures: unknown[]
    materials: unknown[]
    bones: unknown[]
    morphs: unknown[]
    displayFrames: unknown[]
    rigidBodies: unknown[]
  }

  export interface VmdBoneKeyFrame {
    boneName: string
    frameIndex: number
    position: [number, number, number]
    rotation: [number, number, number, number]
  }

  export interface VmdObject {
    boneKeyFrames: {
      length: number
      get(index: number): VmdBoneKeyFrame | undefined
    }
  }

  export declare class VMDLoader extends Loader<VmdObject> {
    constructor(manager?: LoadingManager)
    load(url: string, onLoad: (object: VmdObject) => void, onProgress?: (event: ProgressEvent) => void, onError?: (event: ErrorEvent) => void): void
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<VmdObject>
  }

  export declare const buildAnimation: (vmd: VmdObject, mesh: SkinnedMesh) => AnimationClip
  export declare const buildCameraAnimation: (vmd: VmdObject) => AnimationClip
  export declare const buildBones: (pmx: PmxObject) => Bone[]
  export declare const buildGeometry: (pmx: PmxObject) => BufferGeometry
  export declare const buildGrants: (mmd: MMD) => Grant[]
  export declare const buildIK: (mmd: MMD) => IK[]
  export declare const buildMaterial: (pmx: PmxObject) => ShaderMaterial
  export declare const buildMesh: (geometry: BufferGeometry, materials: unknown[]) => SkinnedMesh
  export declare const processBones: (bones: Bone[]) => void
}
