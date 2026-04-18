import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendPepTutorBackendAuthQuery,
  applyPepTutorBackendAuthResponseHeaders,
  buildPepTutorBackendAuthHeaders,
  clearPepTutorBackendRuntimeAuthForTest,
  isPepTutorAccessTokenExpiring,
  resolvePepTutorBackendAuth,
  resolvePepTutorBackendLoginConfig,
  setPepTutorBackendRuntimeAuth,
} from './peptutor-backend-auth'

describe('peptutor backend auth utils', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    clearPepTutorBackendRuntimeAuthForTest()
  })

  it('resolves lesson api key from env', () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_KEY', 'lesson-api-key')

    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: '',
      apiKey: 'lesson-api-key',
    })
    expect(buildPepTutorBackendAuthHeaders()).toEqual({
      'X-API-Key': 'lesson-api-key',
    })
  })

  it('prefers bearer token over api key when both are configured', () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_KEY', 'lesson-api-key')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_BEARER_TOKEN', 'lesson-jwt')

    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'lesson-jwt',
      apiKey: 'lesson-api-key',
    })
    expect(buildPepTutorBackendAuthHeaders()).toEqual({
      Authorization: 'Bearer lesson-jwt',
    })
  })

  it('appends websocket auth query parameters', () => {
    expect(appendPepTutorBackendAuthQuery('wss://lesson.example.test/api/peptutor/doubao-realtime-asr', {
      apiKey: 'lesson-api-key',
    })).toBe('wss://lesson.example.test/api/peptutor/doubao-realtime-asr?api_key=lesson-api-key')

    expect(appendPepTutorBackendAuthQuery('wss://lesson.example.test/api/peptutor/doubao-realtime-asr?api_key=old', {
      accessToken: 'lesson-jwt',
      apiKey: 'lesson-api-key',
    })).toBe('wss://lesson.example.test/api/peptutor/doubao-realtime-asr?access_token=lesson-jwt')
  })

  it('merges runtime auth overrides on top of env auth', () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_KEY', 'lesson-api-key')
    setPepTutorBackendRuntimeAuth({
      accessToken: 'runtime-jwt',
    })

    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'runtime-jwt',
      apiKey: 'lesson-api-key',
    })
  })

  it('updates runtime auth from token renewal headers', () => {
    applyPepTutorBackendAuthResponseHeaders(new Headers({
      'X-New-Token': 'renewed-jwt',
    }))

    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'renewed-jwt',
      apiKey: '',
    })
  })

  it('resolves lesson login credentials from env', () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_USERNAME', 'teacher')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_PASSWORD', 'secret')

    expect(resolvePepTutorBackendLoginConfig()).toEqual({
      username: 'teacher',
      password: 'secret',
    })
  })

  it('detects expiring jwt payloads', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const expiringPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const freshPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

    expect(isPepTutorAccessTokenExpiring(`${header}.${expiringPayload}.sig`, 30)).toBe(true)
    expect(isPepTutorAccessTokenExpiring(`${header}.${freshPayload}.sig`, 30)).toBe(false)
  })
})
