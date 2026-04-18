import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  clearPepTutorBackendRuntimeAuthForTest,
  resolvePepTutorBackendAuth,
  setPepTutorBackendRuntimeAuth,
} from '../utils/peptutor-backend-auth'
import {
  bootstrapPepTutorBackendAuth,
  fetchPepTutorBackend,
} from './peptutor-backend-auth'

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

describe('peptutor backend auth store', () => {
  afterEach(() => {
    clearPepTutorBackendRuntimeAuthForTest()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('bootstraps a login token for protected lesson backends', async () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_URL', 'https://lesson.example.test')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_USERNAME', 'teacher')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_PASSWORD', 'secret')

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        auth_configured: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'lesson-login-jwt',
        token_type: 'bearer',
      }))

    vi.stubGlobal('fetch', fetchSpy)

    await bootstrapPepTutorBackendAuth()

    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://lesson.example.test/auth-status', {
      method: 'GET',
    })
    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://lesson.example.test/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: 'teacher',
        password: 'secret',
      }),
    })
    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'lesson-login-jwt',
      apiKey: '',
    })
  })

  it('reuses the guest token when auth is disabled', async () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_URL', 'https://lesson.example.test')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_USERNAME', 'teacher')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_PASSWORD', 'secret')

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        auth_configured: false,
        access_token: 'guest-token',
      }))

    vi.stubGlobal('fetch', fetchSpy)

    await bootstrapPepTutorBackendAuth()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'guest-token',
      apiKey: '',
    })
  })

  it('retries one protected request after re-login and stores the renewed token header', async () => {
    vi.stubEnv('VITE_PEPTUTOR_LESSON_API_URL', 'https://lesson.example.test')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_USERNAME', 'teacher')
    vi.stubEnv('VITE_PEPTUTOR_LESSON_AUTH_PASSWORD', 'secret')

    setPepTutorBackendRuntimeAuth({
      accessToken: 'expired-token',
    })

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Invalid token. Please login again.' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        auth_configured: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'refreshed-login-token',
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-New-Token': 'renewed-after-request',
        },
      }))

    vi.stubGlobal('fetch', fetchSpy)

    const response = await fetchPepTutorBackend('https://lesson.example.test/lesson/catalog', {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://lesson.example.test/lesson/catalog', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer expired-token',
      },
    })
    expect(fetchSpy).toHaveBeenNthCalledWith(4, 'https://lesson.example.test/lesson/catalog', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer refreshed-login-token',
      },
    })
    expect(resolvePepTutorBackendAuth()).toEqual({
      accessToken: 'renewed-after-request',
      apiKey: '',
    })
  })
})
