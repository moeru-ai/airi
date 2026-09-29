import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStartupResourcesStore } from './startup-resources'

describe('startup resources', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('counts completed resources and keeps a failed model blocking', () => {
    const startup = useStartupResourcesStore()
    startup.register(['config', 'model'])
    startup.start('config')
    startup.complete('config')
    startup.start('model')
    startup.fail('model', new Error('Model download failed'))

    expect(startup.progress).toBe(50)
    expect(startup.ready).toBe(false)
    expect(startup.failed?.error).toBe('Model download failed')
  })

  it('records an initialization rejection before propagating it', async () => {
    const startup = useStartupResourcesStore()
    startup.register(['auth'])

    await expect(startup.run('auth', async () => {
      throw new Error('Offline')
    })).rejects.toThrow('Offline')
    expect(startup.failed?.id).toBe('auth')
    expect(startup.progress).toBe(0)
  })

  it('allows a model resource to be skipped when no model is selected', () => {
    const startup = useStartupResourcesStore()
    startup.register(['config', 'model'])
    startup.start('config')
    startup.complete('config')
    startup.skip('model')

    expect(startup.ready).toBe(true)
    expect(startup.progress).toBe(100)
  })

  it('recovers when the user skips a failed character model', () => {
    const startup = useStartupResourcesStore()
    startup.register(['model'])
    startup.start('model')
    startup.fail('model', new Error('Corrupt archive'))
    startup.skip('model')

    expect(startup.failed).toBeUndefined()
    expect(startup.ready).toBe(true)
  })

  it('rejects duplicate and unknown resource IDs', () => {
    const startup = useStartupResourcesStore()
    expect(() => startup.register(['auth', 'auth'])).toThrow('unique')
    startup.register(['auth'])
    expect(() => startup.start('missing')).toThrow('Unknown')
  })

  it('does not let an earlier startup run update a new registration', async () => {
    const startup = useStartupResourcesStore()
    startup.register(['auth'])
    let finishLoad: (() => void) | undefined
    const pending = startup.run('auth', () => new Promise<void>((resolve) => {
      finishLoad = resolve
    }))

    startup.reset()
    startup.register(['auth'])
    startup.start('auth')
    finishLoad?.()

    await expect(pending).rejects.toThrow('reset')
    expect(startup.resources[0]?.status).toBe('loading')
    expect(startup.failed).toBeUndefined()
  })
})
