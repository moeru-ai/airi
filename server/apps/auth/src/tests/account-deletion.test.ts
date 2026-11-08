import type { AuthDatabase } from '../db'
import type { EmailService } from '../email'
import type { AuthEnv } from '../env'
import type { ResourceApi } from '../resource-api'

import { user as userTable } from '@proj-airi/auth-shared'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAuth } from '../auth'
import { createTestDatabase } from './mock-db'

const env = {
  PUBLIC_URL: 'http://localhost:3000',
  AUTH_GOOGLE_CLIENT_ID: 'google-client',
  AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
  AUTH_GITHUB_CLIENT_ID: 'github-client',
  AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  ADDITIONAL_TRUSTED_ORIGINS: [],
} as unknown as AuthEnv

describe('account deletion with a subscription that can still charge', () => {
  /** The order of the deletion side effects. */
  let calls: string[]
  /** The resource API refuses the deletion when this is true. */
  let subscriptionActive: boolean
  let deletionUrl: string | null
  let auth: ReturnType<typeof createAuth>
  let cookie: string

  const email = {
    async sendVerification() {},
    async sendDeleteAccountVerification({ url }) {
      calls.push('email')
      deletionUrl = url
    },
  } as Partial<EmailService> as EmailService

  const resourceApi: ResourceApi = {
    async checkUserDeletion() {
      calls.push('check')
      if (subscriptionActive)
        throw new APIError('CONFLICT', { code: 'SUBSCRIPTION_ACTIVE', message: 'Cancel the subscription first.' })
    },
    async softDeleteUserData() {
      calls.push('resource-data')
    },
    async trackAuthEvent() {},
  }

  function request(path: string, method: 'GET' | 'POST', body: Record<string, string> = {}) {
    return auth.handler(new Request(new URL(path, env.PUBLIC_URL), {
      method,
      headers: { 'cookie': cookie, 'origin': env.PUBLIC_URL, 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }))
  }

  beforeAll(async () => {
    const db = await createTestDatabase()
    // The in-memory database has the same query interface as the pooled production handle.
    auth = createAuth(db as unknown as AuthDatabase, env, email, null, resourceApi, {
      async revokeForUser() {
        calls.push('external-authorizations')
      },
    })

    cookie = ''
    const credentials = { email: 'user@example.com', password: 'correct-horse-battery' }
    await request('/api/auth/sign-up/email', 'POST', { name: 'User One', ...credentials })
    // Sign-in needs a verified address. The verification email is not part of this flow.
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.email, credentials.email))
    const signedIn = await request('/api/auth/sign-in/email', 'POST', credentials)
    cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  })

  beforeEach(() => {
    calls = []
    subscriptionActive = false
    deletionUrl = null
  })

  // https://github.com/moeru-ai/airi/pull/2910#discussion_r4239058368
  // ROOT CAUSE:
  //
  // The subscription check ran in the resource cleanup, after Auth revoked the external authorizations.
  // A refusal left the account without its Apple, Google, or GitHub grant.
  //
  // Auth now asks the resource API first. A refusal changes nothing.
  it('sends no email for a deletion request that the resource API refuses', async () => {
    subscriptionActive = true

    const response = await request('/api/auth/delete-user', 'POST')

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'SUBSCRIPTION_ACTIVE' })
    expect(calls).toEqual(['check'])
  })

  it('checks, then sends the email, for a request that the resource API accepts', async () => {
    const response = await request('/api/auth/delete-user', 'POST')

    expect(response.status).toBe(200)
    expect(calls).toEqual(['check', 'email'])
  })

  it('keeps the external authorizations when the user subscribes after the email', async () => {
    await request('/api/auth/delete-user', 'POST')
    expect(deletionUrl).not.toBeNull()
    calls = []
    subscriptionActive = true

    const confirmation = new URL(deletionUrl!)
    const response = await request(confirmation.pathname + confirmation.search, 'GET')

    expect(response.status).toBe(409)
    expect(calls).toEqual(['check'])
  })

  it('checks before it revokes and cleans up on the email link', async () => {
    await request('/api/auth/delete-user', 'POST')
    calls = []

    const confirmation = new URL(deletionUrl!)
    await request(confirmation.pathname + confirmation.search, 'GET')

    expect(calls).toEqual(['check', 'external-authorizations', 'resource-data'])
  })
})
