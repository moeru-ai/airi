import { describe, expect, it } from 'vitest'

import { buildAdminSignInUrl } from './api'

describe('ui-admin API URL helpers', () => {
  it('builds sign-in URLs with the absolute admin return URL', () => {
    expect(buildAdminSignInUrl(
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5178/llm-router?api_server_url=http%3A%2F%2F127.0.0.1%3A3000',
    )).toBe(
      'http://127.0.0.1:3000/auth/sign-in?redirect=http%3A%2F%2F127.0.0.1%3A5178%2Fllm-router%3Fapi_server_url%3Dhttp%253A%252F%252F127.0.0.1%253A3000',
    )
  })

  it('builds local dev sign-in URLs on the local API origin', () => {
    expect(buildAdminSignInUrl(
      'http://localhost:3000',
      'http://localhost:5178/',
    )).toBe(
      'http://localhost:3000/auth/sign-in?redirect=http%3A%2F%2Flocalhost%3A5178%2F',
    )
  })
})
