import { describe, expect, it } from 'vitest'

import { parseEnv } from './config'

describe('parseEnv', () => {
  it('uses safe defaults for an empty environment', () => {
    const env = parseEnv({})

    expect(env.ALICE_COMPANION_MQTT_URL).toBe('mqtt://localhost:1883')
    expect(env.ALICE_COMPANION_PUBLISH_SITE).toBe('companion')
    expect(env.ALICE_COMPANION_INPUT_SITES).toEqual([])
    expect(env.ALICE_COMPANION_TIME_ZONE).toBe('America/Sao_Paulo')
    expect(env.ALICE_COMPANION_DERIVE_INTERACTIONS).toBe(true)
    expect(env.ALICE_COMPANION_DERIVE_WINDOW_MS).toBe(120_000)
  })

  it('parses lists, booleans, and numbers', () => {
    const env = parseEnv({
      ALICE_COMPANION_INPUT_SITES: ' mirror, ,airi-lab ',
      ALICE_COMPANION_DERIVE_INTERACTIONS: 'false',
      ALICE_COMPANION_DERIVE_WINDOW_MS: '30000',
    })

    expect(env.ALICE_COMPANION_INPUT_SITES).toEqual(['mirror', 'airi-lab'])
    expect(env.ALICE_COMPANION_DERIVE_INTERACTIONS).toBe(false)
    expect(env.ALICE_COMPANION_DERIVE_WINDOW_MS).toBe(30_000)
  })

  it('rejects an unknown time zone', () => {
    expect(() => parseEnv({ ALICE_COMPANION_TIME_ZONE: 'Mars/Olympus' })).toThrow('IANA time zone')
  })

  it('rejects a publish site with a topic separator', () => {
    expect(() => parseEnv({ ALICE_COMPANION_PUBLISH_SITE: 'a/b' })).toThrow('one topic level')
  })
})
