import type { ProfileUser } from '../modules/profile'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProfilePage from './profile.vue'

const profileMocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}))
const analyticsMocks = vi.hoisted(() => ({
  emailChange: vi.fn(),
}))

vi.mock('@proj-airi/stage-ui/components/auth/providers', () => ({ defaultSignInProviders: [] }))
vi.mock('@proj-airi/stage-ui/composables/use-linked-accounts', async () => {
  const { shallowRef } = await import('vue')
  return {
    useLinkedAccounts: () => ({
      accountsByProvider: shallowRef(new Map()),
      error: shallowRef(null),
      hasCredentialAccount: shallowRef(false),
      inFlight: shallowRef(null),
      link: vi.fn(),
      loaded: shallowRef(true),
      loading: shallowRef(false),
      message: shallowRef(null),
      unlink: vi.fn(),
    }),
  }
})
vi.mock('@proj-airi/stage-ui/libs/server', () => ({ SERVER_URL: 'https://auth.airi.test' }))
vi.mock('../modules/auth-client', () => ({ getAuthClient: vi.fn(() => ({})) }))
vi.mock('../modules/server-auth-context', () => ({
  getServerAuthBootstrapContext: () => ({ apiServerUrl: 'https://auth.airi.test' }),
}))
vi.mock('../modules/profile', async (importOriginal) => {
  const original = await importOriginal<typeof import('../modules/profile')>()
  return { ...original, getCurrentSession: profileMocks.getCurrentSession }
})
vi.mock('../modules/analytics', async (importOriginal) => {
  const original = await importOriginal<typeof import('../modules/analytics')>()
  return {
    ...original,
    identifyAuthUser: vi.fn(),
    trackEmailChange: analyticsMocks.emailChange,
  }
})

const placeholderEmail = 'user@steam.placeholder.local'
const placeholderGravatarUrl = 'https://www.gravatar.com/avatar/hash-derived-from-placeholder-local'
const placeholderUser: ProfileUser = {
  createdAt: '2026-01-01T00:00:00.000Z',
  email: placeholderEmail,
  emailVerified: false,
  id: 'user-1',
  image: placeholderGravatarUrl,
  name: 'Airi User',
}
const realEmailUser: ProfileUser = {
  ...placeholderUser,
  email: 'current@example.com',
  emailVerified: true,
  image: null,
}
const refreshedUser: ProfileUser = {
  ...realEmailUser,
  email: 'new@example.com',
}

function createTestI18n() {
  return createI18n({
    fallbackWarn: false,
    legacy: false,
    locale: 'en',
    missingWarn: false,
    messages: {
      en: {
        server: {
          auth: {
            profile: {
              action: { sendSetPasswordLink: 'Set password' },
              avatar: {
                altText: 'Profile avatar',
                gravatarLink: 'Manage on gravatar.com',
                gravatarNotice: 'Avatar from Gravatar.',
              },
              description: 'Manage account.',
              emailChange: {
                action: { add: 'Add email', change: 'Change email', resend: 'Resend', resendIn: 'Resend in {seconds}s', retry: 'Retry' },
                accepted: { current: 'Sent to current email.', new: 'Sent to new email.' },
                callback: { failed: 'The email-change link failed.', processed: 'The email-change link was processed.' },
                current: { label: 'Current email', notSet: 'Not set', unverified: 'Unverified', verified: 'Verified' },
                description: { add: 'Add an email.', change: 'Change the email.' },
                error: { rateLimited: 'Too many requests.', request: 'Request failed.', unavailable: 'Email unavailable.' },
                input: { label: 'New email', placeholder: 'you{\'@\'}example.com' },
                passwordDependency: 'Add an email before you set a password.',
                title: { add: 'Add email', change: 'Change email' },
              },
              field: { createdAt: 'Joined', email: 'Email', emailVerified: 'Email status' },
              label: { unverified: 'Unverified', verified: 'Verified' },
              name: { label: 'Display name', placeholder: 'Display name' },
              password: { setDescription: 'Set a password by email.' },
              section: { linkedAccounts: 'Connected accounts', password: 'Password', profile: 'Profile' },
              title: 'Account profile',
            },
          },
        },
      },
    },
  })
}

async function renderProfile(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', component: ProfilePage },
      { path: '/sign-in', component: ProfilePage },
    ],
  })
  await router.push(path)
  await router.isReady()

  const screen = await render(ProfilePage, {
    global: { plugins: [router, createTestI18n()] },
  })

  return { router, screen }
}

function successfulResponse(): Response {
  return new Response(JSON.stringify({ status: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('profile email change', () => {
  beforeEach(() => {
    profileMocks.getCurrentSession.mockReset()
    analyticsMocks.emailChange.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => successfulResponse()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not render a placeholder email or its Gravatar URL', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: placeholderUser })

    const { screen } = await renderProfile('/profile')

    await expect.element(screen.getByText('Not set')).toBeVisible()
    const html = document.documentElement.outerHTML
    expect(html).not.toContain(placeholderEmail)
    expect(html).not.toContain('.local')
    expect(html).not.toContain(placeholderGravatarUrl)
    expect(document.querySelector('[data-avatar-image]')).toBeNull()
    expect(document.querySelector(`img[src="${placeholderGravatarUrl}"]`)).toBeNull()
    expect(document.querySelector(`a[href*="${encodeURIComponent(placeholderEmail)}"]`)).toBeNull()
  })

  it('disables password setup until the user has a real email', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: placeholderUser })

    const { screen } = await renderProfile('/profile')

    await expect.element(screen.getByText('Add an email before you set a password.')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Set password' })).toBeDisabled()
  })

  it('refreshes the session after a native callback', async () => {
    profileMocks.getCurrentSession
      .mockResolvedValueOnce({ user: realEmailUser })
      .mockResolvedValueOnce({ user: refreshedUser })

    const { screen } = await renderProfile('/profile?email_change=processed')

    await expect.element(screen.getByText('The email-change link was processed.')).toBeVisible()
    await expect.element(screen.getByText('new@example.com').first()).toBeVisible()
    expect(profileMocks.getCurrentSession).toHaveBeenCalledTimes(2)
    expect(analyticsMocks.emailChange).toHaveBeenCalledWith({ result: 'callback_processed' })
  })

  it('does not record a failed callback as a native completion', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    await renderProfile('/profile?email_change=processed&error=TOKEN_EXPIRED')

    // ROOT CAUSE:
    //
    // The page added `callback_failed` to the analytics protocol, although the
    // native callback contract only permits the proven `callback_processed` result.
    // We fixed this by keeping failure feedback local to the profile page.
    await vi.waitFor(() => expect(profileMocks.getCurrentSession).toHaveBeenCalledTimes(2))
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
  })

  it('redirects without stale controls when the callback refresh loses the session', async () => {
    profileMocks.getCurrentSession
      .mockResolvedValueOnce({ user: realEmailUser })
      .mockResolvedValueOnce({ user: null })

    const { router } = await renderProfile('/profile?email_change=processed&keep=yes')

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/sign-in')
    })
    expect(router.currentRoute.value.query).toEqual({ redirect: '/profile' })
    expect(document.body.textContent).not.toContain('current@example.com')
    expect(document.querySelector('input[type="email"]')).toBeNull()
    expect(document.querySelector('button')).toBeNull()
  })

  it('removes only email-change query keys and preserves other query values and the hash', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    const { router, screen } = await renderProfile(
      '/profile?email_change=processed&error=TOKEN_EXPIRED&keep=yes&source=account&source=banner#security',
    )

    await expect.element(screen.getByText('The email-change link failed.')).toBeVisible()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        keep: 'yes',
        source: ['account', 'banner'],
      })
    })
    expect(router.currentRoute.value.hash).toBe('#security')
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
  })

  it('does not consume an array callback marker or its error values', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    const { router } = await renderProfile(
      '/profile?email_change=processed&email_change=tampered&error=TOKEN_EXPIRED&error=private-server-message',
    )

    await vi.waitFor(() => expect(profileMocks.getCurrentSession).toHaveBeenCalledOnce())
    expect(router.currentRoute.value.query).toEqual({
      email_change: ['processed', 'tampered'],
      error: ['TOKEN_EXPIRED', 'private-server-message'],
    })
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
  })

  it('preserves a malformed array error and reports a local callback failure', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    const { router, screen } = await renderProfile(
      '/profile?email_change=processed&error=TOKEN_EXPIRED&error=private-server-message&keep=yes',
    )

    // ROOT CAUSE:
    //
    // The page treated an unrecognized error value as if no error existed.
    // The page must show its local failure text without exposing the raw value.
    // We fixed this by treating every present error as a failure and preserving unknown values.
    await expect.element(screen.getByText('The email-change link failed.')).toBeVisible()
    expect(document.body.textContent).not.toContain('private-server-message')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        email_change: 'processed',
        error: ['TOKEN_EXPIRED', 'private-server-message'],
        keep: 'yes',
      })
    })
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
    expect(JSON.stringify(analyticsMocks.emailChange.mock.calls)).not.toContain('private-server-message')
  })

  it('preserves an unknown scalar error and reports a local callback failure', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    const { router, screen } = await renderProfile(
      '/profile?email_change=processed&error=private-server-message&keep=yes',
    )

    await expect.element(screen.getByText('The email-change link failed.')).toBeVisible()
    expect(document.body.textContent).not.toContain('private-server-message')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        email_change: 'processed',
        error: 'private-server-message',
        keep: 'yes',
      })
    })
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
    expect(JSON.stringify(analyticsMocks.emailChange.mock.calls)).not.toContain('private-server-message')
  })

  it('preserves an unrelated error parameter when the callback marker is absent', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: realEmailUser })

    const { router } = await renderProfile('/profile?error=unrelated-login-error&keep=yes')

    await vi.waitFor(() => expect(profileMocks.getCurrentSession).toHaveBeenCalledOnce())
    expect(router.currentRoute.value.query).toEqual({
      error: 'unrelated-login-error',
      keep: 'yes',
    })
    expect(analyticsMocks.emailChange).not.toHaveBeenCalled()
  })

  it('tracks a native request from the current email classification only', async () => {
    profileMocks.getCurrentSession.mockResolvedValue({ user: placeholderUser })
    const { screen } = await renderProfile('/profile')

    await screen.getByRole('textbox', { name: 'New email' }).fill('private-target@example.com')
    await screen.getByRole('button', { name: 'Add email' }).click()

    await vi.waitFor(() => {
      expect(analyticsMocks.emailChange).toHaveBeenCalledWith({
        flow: 'placeholder',
        result: 'requested',
      })
    })
    expect(JSON.stringify(analyticsMocks.emailChange.mock.calls)).not.toContain(placeholderEmail)
    expect(JSON.stringify(analyticsMocks.emailChange.mock.calls)).not.toContain('private-target@example.com')
  })
})
