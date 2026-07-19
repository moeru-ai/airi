import type { StorageLike } from './settings-transfer'

import { describe, expect, it } from 'vitest'

import { applySettingsBackup, collectSettingsBackup, isSecretSettingsKey, parseSettingsBackup, serializeSettingsBackup } from './settings-transfer'

function fakeStorage(entries: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    dump: () => Object.fromEntries(map),
  }
}

describe('collectSettingsBackup', () => {
  it('exports settings keys with raw string values', () => {
    const storage = fakeStorage({
      'settings/language': 'en-US',
      'settings/theme/colors/hue': '220.44',
      'settings/credentials/providers': '{"openai":{"apiKey":"sk-1"}}',
    })

    const backup = collectSettingsBackup(storage, { includeSecrets: true })

    expect(backup.kind).toBe('airi-settings-backup')
    expect(backup.version).toBe(1)
    // Raw strings preserved exactly — no JSON re-encoding of scalar values.
    expect(backup.settings['settings/language']).toBe('en-US')
    expect(backup.settings['settings/theme/colors/hue']).toBe('220.44')
    expect(backup.settings['settings/credentials/providers']).toBe('{"openai":{"apiKey":"sk-1"}}')
  })

  it('omits secrets unless explicitly included', () => {
    const storage = fakeStorage({
      'settings/language': 'en-US',
      'settings/credentials/providers': '{"openai":{"apiKey":"sk-1"}}',
      'settings/discord/token': 'discord-token',
      'settings/twitter/api-secret': 'twitter-secret',
      'settings/connection/websocket-auth-token': 'ws-token',
      'artistry-replicate-api-key': 'replicate-key',
    })

    const withoutSecrets = collectSettingsBackup(storage, { includeSecrets: false })
    expect(Object.keys(withoutSecrets.settings)).toEqual(['settings/language'])

    const withSecrets = collectSettingsBackup(storage, { includeSecrets: true })
    expect(Object.keys(withSecrets.settings)).toHaveLength(6)
  })

  it('never exports auth or server-owned account state', () => {
    const storage = fakeStorage({
      'auth/v1/token': 'session-token',
      'auth/v1/refresh-token': 'refresh-token',
      'user/v1/flux': '{"balance":10}',
      'settings/language': 'en-US',
    })

    const backup = collectSettingsBackup(storage, { includeSecrets: true })

    expect(Object.keys(backup.settings)).toEqual(['settings/language'])
  })

  it('ignores unrelated storage keys', () => {
    const storage = fakeStorage({
      'some-third-party-lib-cache': 'x',
      'settings/language': 'en-US',
      'airi-card-active-id': 'card-1',
      'onboarding/completed': 'true',
    })

    const backup = collectSettingsBackup(storage, { includeSecrets: false })

    expect(Object.keys(backup.settings).sort()).toEqual([
      'airi-card-active-id',
      'onboarding/completed',
      'settings/language',
    ])
  })
})

describe('serialize / parse round-trip', () => {
  it('round-trips a backup through JSON', () => {
    const storage = fakeStorage({ 'settings/language': 'ja-JP' })
    const backup = collectSettingsBackup(storage, { includeSecrets: false })

    const parsed = parseSettingsBackup(serializeSettingsBackup(backup))

    expect(parsed).toEqual(backup)
  })

  it('rejects malformed JSON with a descriptive error', () => {
    expect(() => parseSettingsBackup('{nope')).toThrow(/Failed to parse settings backup/)
  })

  it('rejects JSON that is not a settings backup', () => {
    expect(() => parseSettingsBackup('{"foo":1}')).toThrow(/does not look like an AIRI settings backup/)
    expect(() => parseSettingsBackup('{"kind":"airi-settings-backup","version":2,"settings":{}}')).toThrow(/does not look like an AIRI settings backup/)
    expect(() => parseSettingsBackup('{"kind":"airi-settings-backup","version":1,"settings":{"a":1}}')).toThrow(/does not look like an AIRI settings backup/)
  })
})

describe('applySettingsBackup', () => {
  it('writes raw values back and counts applied keys', () => {
    const storage = fakeStorage()

    const { appliedCount } = applySettingsBackup(storage, {
      kind: 'airi-settings-backup',
      version: 1,
      settings: {
        'settings/language': 'zh-Hans',
        'settings/credentials/providers': '{"openai":{"apiKey":"sk-2"}}',
      },
    })

    expect(appliedCount).toBe(2)
    expect(storage.dump()).toEqual({
      'settings/language': 'zh-Hans',
      'settings/credentials/providers': '{"openai":{"apiKey":"sk-2"}}',
    })
  })

  it('drops keys outside the exportable policy from untrusted files', () => {
    const storage = fakeStorage()

    const { appliedCount } = applySettingsBackup(storage, {
      kind: 'airi-settings-backup',
      version: 1,
      settings: {
        'auth/v1/token': 'planted-session',
        'user/v1/flux': '{"balance":9999}',
        'totally-unrelated': 'x',
        'settings/language': 'en-US',
      },
    })

    expect(appliedCount).toBe(1)
    expect(storage.dump()).toEqual({ 'settings/language': 'en-US' })
  })
})

describe('isSecretSettingsKey', () => {
  it('classifies credential keys as secrets', () => {
    expect(isSecretSettingsKey('settings/credentials/providers')).toBe(true)
    expect(isSecretSettingsKey('settings/discord/token')).toBe(true)
    expect(isSecretSettingsKey('settings/twitter/access-token-secret')).toBe(true)
    expect(isSecretSettingsKey('settings/web-search/api-key')).toBe(true)
    expect(isSecretSettingsKey('artistry-nanobanana-api-key')).toBe(true)
  })

  it('does not classify ordinary settings as secrets', () => {
    expect(isSecretSettingsKey('settings/language')).toBe(false)
    expect(isSecretSettingsKey('settings/speech/active-provider')).toBe(false)
    expect(isSecretSettingsKey('onboarding/completed')).toBe(false)
  })
})
