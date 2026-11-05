import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStage, isStageTamagotchi, isStageWeb, StageEnvironment } from './environment'

describe('stage environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['electron', 'kirie'])('reports the Tamagotchi stage for the %s host', (runtime) => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', runtime)

    expect(isStageTamagotchi()).toBe(true)
    expect(isStageWeb()).toBe(false)
    expect(getStage()).toBe(StageEnvironment.Tamagotchi)
  })

  it('reports the web stage for a browser build', () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'browser')

    expect(isStageTamagotchi()).toBe(false)
    expect(getStage()).toBe(StageEnvironment.Web)
  })
})
