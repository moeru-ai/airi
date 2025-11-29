export enum StageEnvironment {
  Web = 'web',
  Tamagotchi = 'tamagotchi',
}

export function isStageWeb(): boolean {
  return !import.meta.env.RUNTIME_ENVIRONMENT || import.meta.env.RUNTIME_ENVIRONMENT === 'browser'
}

export function isStageTamagotchi(): boolean {
  return import.meta.env.RUNTIME_ENVIRONMENT === 'electron'
}

export function isUrlMode(mode: 'file' | 'server'): boolean {
  if (!import.meta.env.URL_MODE) {
    return mode === 'server'
  }

  return import.meta.env.URL_MODE === mode
}
