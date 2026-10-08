import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'
import { useDiscordStore } from './discord'
import { useTwitterStore } from './twitter'

describe('steam managed services', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
  })
  afterEach(() => {
    disposePinia(pinia)
    vi.unstubAllEnvs()
  })

  // ROOT CAUSE: Hidden AI provider settings left separate Discord and X
  // credential forms and the shared configuration transport unrestricted.
  it('does not activate or send saved third-party credentials', () => {
    const discord = useDiscordStore()
    const twitter = useTwitterStore()
    discord.enabled = true
    discord.token = 'invalid-test-credential'
    twitter.enabled = true
    twitter.apiKey = twitter.apiSecret = twitter.accessToken = twitter.accessTokenSecret = 'invalid-test-credential'
    expect(discord.configured).toBe(false)
    expect(twitter.configured).toBe(false)
    discord.saveSettings()
    twitter.saveSettings()
    expect(useModsServerChannelStore().pendingSendCount).toBe(0)
  })

  it('rejects direct configuration calls before queuing credentials', () => {
    const configurator = useConfiguratorByModsChannelServer()
    configurator.updateFor('discord', { enabled: true, token: 'invalid-test-credential' })
    configurator.updateFor('twitter', { enabled: true, apiKey: 'invalid-test-credential' })
    expect(useModsServerChannelStore().pendingSendCount).toBe(0)
  })
})
