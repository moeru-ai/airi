import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { usePhotonStore } from './photon'

describe('usePhotonStore', () => {
  // The real configurator opens a WebSocket to the channel server. The spy keeps the test off the network.
  let updateFor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    updateFor = vi.spyOn(useConfiguratorByModsChannelServer(), 'updateFor').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is configured only with a project ID and an API key', () => {
    const store = usePhotonStore()
    expect(store.configured).toBe(false)

    store.projectId = 'pho_prj_example'
    expect(store.configured).toBe(false)

    store.apiKey = '  \n'
    expect(store.configured).toBe(false)

    store.apiKey = 'pho_sk_example'
    expect(store.configured).toBe(true)
  })

  it('sends the settings to the photon module without the spaces around a pasted value', () => {
    const store = usePhotonStore()
    store.enabled = true
    store.projectId = ' pho_prj_example '
    store.apiKey = 'pho_sk_example\n'

    store.saveSettings()

    expect(updateFor).toHaveBeenCalledExactlyOnceWith('photon', { enabled: true, projectId: 'pho_prj_example', apiKey: 'pho_sk_example' })
  })

  it('clears the API key on reset and tells the module to stop', () => {
    const store = usePhotonStore()
    store.enabled = true
    store.projectId = 'pho_prj_example'
    store.apiKey = 'pho_sk_example'

    store.resetState()

    expect(store.apiKey).toBe('')
    expect(updateFor).toHaveBeenCalledExactlyOnceWith('photon', { enabled: false, projectId: '', apiKey: '' })
  })
})
