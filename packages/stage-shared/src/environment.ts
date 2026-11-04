export enum StageEnvironment {
  Web = 'web',
  Capacitor = 'capacitor',
  Tamagotchi = 'tamagotchi',
}

/**
 * Build-time dev flag, replaced by Vite as a literal `true`/`false` so the
 * unused branch is tree-shaken in production bundles.
 */
export const IS_DEV: boolean = import.meta.env.DEV

export function isStageWeb(): boolean {
  return !import.meta.env.RUNTIME_ENVIRONMENT || import.meta.env.RUNTIME_ENVIRONMENT === 'browser'
}

export function isStageCapacitor(): boolean {
  return import.meta.env.RUNTIME_ENVIRONMENT === 'capacitor'
}

/**
 * Reports a Stage Tamagotchi desktop build. The Electron and Kirie hosts share this UI.
 * Use `isElectronWindow` to select the Electron transport.
 */
export function isStageTamagotchi(): boolean {
  return import.meta.env.RUNTIME_ENVIRONMENT === 'electron' || import.meta.env.RUNTIME_ENVIRONMENT === 'kirie'
}

export function getStage() {
  if (isStageTamagotchi())
    return StageEnvironment.Tamagotchi

  if (isStageCapacitor())
    return StageEnvironment.Capacitor

  return StageEnvironment.Web
}

export function isUrlMode(mode: 'file' | 'server'): boolean {
  if (!import.meta.env.URL_MODE) {
    return mode === 'server'
  }

  return import.meta.env.URL_MODE === mode
}
