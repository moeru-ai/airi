import type { InjectionKey, Ref } from 'vue'

export type StartupSceneState = 'pending' | 'loading' | 'mounted' | 'error'

/** Shares the initial scene state between the home page and the app startup screen. */
export const startupSceneStateKey: InjectionKey<Ref<StartupSceneState>> = Symbol('startup-scene-state')
