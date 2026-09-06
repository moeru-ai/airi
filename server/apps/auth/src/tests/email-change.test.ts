import type { AuthDatabase } from '../db'
import type { EmailService } from '../email'
import type { AuthEnv } from '../env'

import { user } from '@proj-airi/auth-shared'
import { eq } from 'drizzle-orm'
import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { createAuth } from '../auth'
import { createTestDatabase } from './mock-db'

const BASE_URL = 'http://localhost:3000'
const CURRENT_EMAIL = 'current@example.com'
const MIGRATED_PLACEHOLDER_EMAIL = '76561198012345678@steam.placeholder.local'
const NEW_EMAIL = 'new@example.com'
const TRUSTED_CALLBACK_URL = 'https://accounts.airi.build/ui/profile?email_change=processed'

function createTestEmailService() {
  return {
    send: vi.fn<EmailService['send']>(async () => {}),
    sendVerification: vi.fn<EmailService['sendVerification']>(async () => {}),
    sendPasswordReset: vi.fn<EmailService['sendPasswordReset']>(async () => {}),
    sendMagicLink: vi.fn<EmailService['sendMagicLink']>(async () => {}),
    sendChangeEmailConfirmation: vi.fn<EmailService['sendChangeEmailConfirmation']>(async () => {}),
    sendDeleteAccountVerification: vi.fn<EmailService['sendDeleteAccountVerification']>(async () => {}),
  } satisfies EmailService
}

function createTestAuthEnv(): AuthEnv {
  return {
    HOST: '127.0.0.1',
    PORT: 3000,
    PUBLIC_URL: BASE_URL,
    RESOURCE_SERVER_URL: 'http://localhost:3001',
    AUTH_UI_URL: 'https://accounts.airi.build/ui',
    ADDITIONAL_TRUSTED_ORIGINS: [],
    DATABASE_URL: 'postgres://localhost/auth-test',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    AUTH_GOOGLE_CLIENT_ID: 'google-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_GITHUB_CLIENT_ID: 'github-client',
    AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    AUTH_APPLE_CLIENT_ID: '',
    AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: [],
    AUTH_APPLE_TEAM_ID: '',
    AUTH_APPLE_KEY_ID: '',
    AUTH_APPLE_PRIVATE_KEY_PEM: '',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: 'noreply@example.com',
    RESEND_FROM_NAME: 'Project AIRI',
    DB_POOL_MAX: 1,
    DB_POOL_IDLE_TIMEOUT_MS: 1000,
    DB_POOL_CONNECTION_TIMEOUT_MS: 1000,
    DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: 1000,
    OTEL_SERVICE_NAME: 'auth-test',
  }
}

function cookieHeader(headers: Headers): string {
  return headers.getSetCookie()
    .map(cookie => cookie.split(';', 1)[0])
    .join('; ')
}

function callbackRequest(url: string, cookie?: string, removeCallbackURL = true): Request {
  const callbackUrl = new URL(url)
  if (removeCallbackURL)
    callbackUrl.searchParams.delete('callbackURL')

  return new Request(callbackUrl, cookie ? { headers: { cookie } } : undefined)
}

function tokenFrom(url: string): string {
  const token = new URL(url).searchParams.get('token')
  if (!token)
    throw new Error('The email callback URL did not include a token.')

  return token
}

async function createVerifiedFixture() {
  const db = await createTestDatabase()
  const email = createTestEmailService()
  const auth = createAuth(db as unknown as AuthDatabase, createTestAuthEnv(), email)
  const signUpResponse = await auth.handler(new Request(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: CURRENT_EMAIL,
      name: 'Email Change User',
      password: 'correct horse battery staple',
    }),
  }))

  if (signUpResponse.status !== 200)
    throw new Error(`The sign-up request returned ${signUpResponse.status}.`)

  const initialVerification = email.sendVerification.mock.calls[0]?.[0]
  if (!initialVerification)
    throw new Error('The sign-up request did not send an email-verification callback.')

  const verificationResponse = await auth.handler(callbackRequest(initialVerification.url))
  if (verificationResponse.status !== 200)
    throw new Error(`The email-verification callback returned ${verificationResponse.status}.`)

  const cookie = cookieHeader(verificationResponse.headers)
  if (!cookie)
    throw new Error('The email-verification callback did not create an authenticated session.')

  email.sendVerification.mockClear()
  email.sendChangeEmailConfirmation.mockClear()

  return { auth, cookie, db, email }
}

async function requestEmailChange(
  fixture: Awaited<ReturnType<typeof createVerifiedFixture>>,
  newEmail = NEW_EMAIL,
  callbackURL = `${BASE_URL}/profile`,
  origin = BASE_URL,
) {
  return fixture.auth.handler(new Request(`${BASE_URL}/api/auth/change-email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': fixture.cookie,
      'origin': origin,
    },
    body: JSON.stringify({
      newEmail,
      callbackURL,
    }),
  }))
}

async function sessionUser(fixture: Awaited<ReturnType<typeof createVerifiedFixture>>) {
  const response = await fixture.auth.handler(new Request(`${BASE_URL}/api/auth/get-session`, {
    headers: { cookie: fixture.cookie },
  }))

  expect(response.status).toBe(200)
  const body = await response.json() as { user?: { email?: string, emailVerified?: boolean } }
  return body.user
}

describe('native email change', () => {
  it('sends confirmation to the verified current email before the new email', async () => {
    const fixture = await createVerifiedFixture()

    const response = await requestEmailChange(fixture)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: true })
    expect(fixture.email.sendChangeEmailConfirmation).toHaveBeenCalledOnce()
    expect(fixture.email.sendChangeEmailConfirmation).toHaveBeenCalledWith({
      to: CURRENT_EMAIL,
      newEmail: NEW_EMAIL,
      url: expect.stringContaining('/api/auth/verify-email?token='),
    })
    expect(fixture.email.sendVerification).not.toHaveBeenCalled()

    const confirmationUrl = fixture.email.sendChangeEmailConfirmation.mock.calls[0][0].url
    const payload = decodeJwt(tokenFrom(confirmationUrl))
    expect(payload.exp).toBeTypeOf('number')
    expect(payload.iat).toBeTypeOf('number')
    expect((payload.exp as number) - (payload.iat as number)).toBe(3600)
  })

  it('sends verification directly for a migrated placeholder email', async () => {
    const fixture = await createVerifiedFixture()
    await fixture.db.update(user)
      .set({
        email: MIGRATED_PLACEHOLDER_EMAIL,
        emailVerified: false,
      })
      .where(eq(user.email, CURRENT_EMAIL))

    expect(await sessionUser(fixture)).toMatchObject({
      email: MIGRATED_PLACEHOLDER_EMAIL,
      emailVerified: false,
    })

    const response = await requestEmailChange(fixture)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: true })
    expect(fixture.email.sendChangeEmailConfirmation).not.toHaveBeenCalled()
    expect(fixture.email.sendVerification).toHaveBeenCalledOnce()
    expect(fixture.email.sendVerification).toHaveBeenCalledWith({
      to: NEW_EMAIL,
      url: expect.stringContaining('/api/auth/verify-email?token='),
    })
  })

  it('does not update the email before the required verification finishes', async () => {
    const fixture = await createVerifiedFixture()
    await fixture.db.update(user)
      .set({ emailVerified: false })
      .where(eq(user.email, CURRENT_EMAIL))

    expect((await requestEmailChange(fixture)).status).toBe(200)
    expect(await sessionUser(fixture)).toMatchObject({ email: CURRENT_EMAIL })
    expect(fixture.email.sendVerification).toHaveBeenCalledOnce()
  })

  it('updates the email and current session after native verification', async () => {
    const fixture = await createVerifiedFixture()

    expect((await requestEmailChange(fixture)).status).toBe(200)
    const confirmationUrl = fixture.email.sendChangeEmailConfirmation.mock.calls[0][0].url
    const confirmationResponse = await fixture.auth.handler(callbackRequest(confirmationUrl, fixture.cookie))
    expect(confirmationResponse.status).toBe(200)
    expect(fixture.email.sendVerification).toHaveBeenCalledOnce()

    const verificationUrl = fixture.email.sendVerification.mock.calls[0][0].url
    const verificationResponse = await fixture.auth.handler(callbackRequest(verificationUrl, fixture.cookie))

    expect(verificationResponse.status).toBe(200)
    await expect(verificationResponse.json()).resolves.toMatchObject({
      status: true,
      user: {
        email: NEW_EMAIL,
        emailVerified: true,
      },
    })
    expect(await sessionUser(fixture)).toMatchObject({
      email: NEW_EMAIL,
      emailVerified: true,
    })
  })

  it('redirects both native callbacks to a trusted callback URL', async () => {
    const fixture = await createVerifiedFixture()

    expect((await requestEmailChange(fixture, NEW_EMAIL, TRUSTED_CALLBACK_URL)).status).toBe(200)
    const confirmationUrl = fixture.email.sendChangeEmailConfirmation.mock.calls[0][0].url
    expect(new URL(confirmationUrl).searchParams.get('callbackURL')).toBe(TRUSTED_CALLBACK_URL)

    const confirmationResponse = await fixture.auth.handler(callbackRequest(confirmationUrl, fixture.cookie, false))

    expect(confirmationResponse.status).toBe(302)
    expect(confirmationResponse.headers.get('location')).toBe(TRUSTED_CALLBACK_URL)
    const verificationUrl = fixture.email.sendVerification.mock.calls[0][0].url
    expect(new URL(verificationUrl).searchParams.get('callbackURL')).toBe(TRUSTED_CALLBACK_URL)

    const verificationResponse = await fixture.auth.handler(callbackRequest(verificationUrl, fixture.cookie, false))

    expect(verificationResponse.status).toBe(302)
    expect(verificationResponse.headers.get('location')).toBe(TRUSTED_CALLBACK_URL)
    expect(await sessionUser(fixture)).toMatchObject({
      email: NEW_EMAIL,
      emailVerified: true,
    })
  })

  it('rejects an untrusted request origin before any email is sent', async () => {
    const fixture = await createVerifiedFixture()

    const response = await requestEmailChange(
      fixture,
      NEW_EMAIL,
      TRUSTED_CALLBACK_URL,
      'https://attacker.example',
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_ORIGIN' })
    expect(fixture.email.sendChangeEmailConfirmation).not.toHaveBeenCalled()
    expect(fixture.email.sendVerification).not.toHaveBeenCalled()
  })

  it('rejects an untrusted callback URL before any email is sent', async () => {
    const fixture = await createVerifiedFixture()

    const response = await requestEmailChange(
      fixture,
      NEW_EMAIL,
      'https://attacker.example/collect',
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CALLBACK_URL' })
    expect(fixture.email.sendChangeEmailConfirmation).not.toHaveBeenCalled()
    expect(fixture.email.sendVerification).not.toHaveBeenCalled()
  })

  it('returns one generic success response when the new email is occupied', async () => {
    const fixture = await createVerifiedFixture()
    const availableResponse = await requestEmailChange(fixture, 'available@example.com')
    const availableBody = await availableResponse.json()
    fixture.email.sendChangeEmailConfirmation.mockClear()

    const occupiedSignUpResponse = await fixture.auth.handler(new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'occupied@example.com',
        name: 'Occupied Email User',
        password: 'correct horse battery staple',
      }),
    }))
    expect(occupiedSignUpResponse.status).toBe(200)
    fixture.email.sendVerification.mockClear()

    const occupiedResponse = await requestEmailChange(fixture, 'occupied@example.com')

    expect(availableResponse.status).toBe(200)
    expect(occupiedResponse.status).toBe(200)
    await expect(occupiedResponse.json()).resolves.toEqual(availableBody)
    expect(availableBody).toEqual({ status: true })
    expect(fixture.email.sendChangeEmailConfirmation).not.toHaveBeenCalled()
    expect(fixture.email.sendVerification).not.toHaveBeenCalled()
  })

  it('rejects a .local destination before any email is sent', async () => {
    const fixture = await createVerifiedFixture()

    const response = await requestEmailChange(fixture, 'placeholder@system.local')

    expect(response.status).toBe(400)
    const body = await response.json() as { code?: string, message?: string }
    expect(body.code).toBe('EMAIL_CHANGE_EMAIL_UNAVAILABLE')
    expect(JSON.stringify(body)).not.toContain('placeholder@system.local')
    expect(fixture.email.sendChangeEmailConfirmation).not.toHaveBeenCalled()
    expect(fixture.email.sendVerification).not.toHaveBeenCalled()
  })
})
