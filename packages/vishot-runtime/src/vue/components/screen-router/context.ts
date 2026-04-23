import type { ComputedRef, InjectionKey } from 'vue'

export interface SceneRouterCaptureRoot {
  id: string
  routePath: string
  title: string
}

export interface SceneRouterStore {
  activeCaptureRootId: ComputedRef<string | null>
  currentRouteCaptureRoots: ComputedRef<SceneRouterCaptureRoot[]>
  navigateToCaptureRoot: (id: string) => Promise<void>
  registerCaptureRoot: (root: SceneRouterCaptureRoot) => void
  unregisterCaptureRoot: (routePath: string, id: string) => void
}

export const injectSceneRouterStore: InjectionKey<SceneRouterStore> = Symbol('vishot:scene-router-store')
