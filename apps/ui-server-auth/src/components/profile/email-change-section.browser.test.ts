import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import EmailChangeSection from './email-change-section.vue'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        server: {
          auth: {
            profile: {
              emailChange: {
                action: {
                  add: 'Add email',
                  change: 'Change email',
                  resend: 'Resend email',
                  resendIn: 'Resend in {seconds}s',
                  retry: 'Try again',
                },
                accepted: {
                  current: 'We sent a confirmation email to your current email address.',
                  new: 'We sent a verification email to your new email address.',
                },
                current: {
                  label: 'Current email',
                  verified: 'Verified',
                  unverified: 'Unverified',
                },
                description: {
                  add: 'Add an email for sign-in, password recovery, and account security.',
                  change: 'Change the email address that you use for your account.',
                },
                error: {
                  rateLimited: 'Too many emails were sent. Try again later.',
                  request: 'We could not send the email. Try again.',
                  unavailable: 'This email address is not available. Use a different email.',
                },
                input: {
                  label: 'New email',
                  placeholder: 'you{\'@\'}example.com',
                },
                title: {
                  add: 'Add email',
                  change: 'Change email',
                },
              },
            },
          },
        },
      },
    },
  })
}

function successfulResponse(): Response {
  return new Response(JSON.stringify({ status: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, status = 400): Response {
  return new Response(JSON.stringify({ code, message }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function rateLimitResponse(): Response {
  return new Response(JSON.stringify({
    error: 'TOO_MANY_REQUESTS',
    message: 'Raw rate-limit message.',
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 429,
  })
}

async function renderSection(props: Partial<InstanceType<typeof EmailChangeSection>['$props']> = {}) {
  return render(EmailChangeSection, {
    props: {
      apiServerUrl: 'https://auth.airi.test',
      email: 'user@example.com',
      emailVerified: true,
      ...props,
    },
    global: {
      plugins: [createTestI18n()],
    },
  })
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const [url, init] = fetchMock.mock.calls[callIndex] ?? []

  return {
    body: JSON.parse(String((init as RequestInit).body)),
    credentials: (init as RequestInit).credentials,
    method: (init as RequestInit).method,
    url: String(url),
  }
}

describe('email change section', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => successfulResponse())
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the form inline without a dialog or popup', async () => {
    const open = vi.spyOn(window, 'open')
    const screen = await renderSection()

    await expect.element(screen.getByRole('region', { name: 'Change email' })).toBeVisible()
    await expect.element(screen.getByRole('textbox', { name: 'New email' })).toBeVisible()
    await expect.element(screen.getByPlaceholder('you@example.com')).toBeVisible()
    expect(document.querySelector('dialog, [role="dialog"]')).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('shows Add email and hides a placeholder email', async () => {
    const placeholder = '123@steam.placeholder.local'
    const screen = await renderSection({ email: placeholder, emailVerified: false })

    await expect.element(screen.getByRole('heading', { name: 'Add email' })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Add email' })).toBeVisible()
    expect(document.body.textContent).not.toContain(placeholder)
    expect(document.body.textContent).not.toContain('.local')
  })

  it('shows Change email for a real email', async () => {
    const screen = await renderSection({ email: 'current@example.com', emailVerified: false })

    await expect.element(screen.getByRole('heading', { name: 'Change email' })).toBeVisible()
    await expect.element(screen.getByText('current@example.com')).toBeVisible()
    await expect.element(screen.getByText('Unverified')).toBeVisible()
  })

  it('uses the native request and shows current-email copy for a verified email', async () => {
    const onSubmitted = vi.fn()
    const open = vi.spyOn(window, 'open')
    const screen = await renderSection({
      email: 'current@example.com',
      emailVerified: true,
      onSubmitted,
    })

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    await expect.element(screen.getByRole('status')).toHaveTextContent(
      'We sent a confirmation email to your current email address.',
    )
    expect(requestBody(fetchMock, 0)).toEqual({
      body: {
        callbackURL: `${window.location.origin}/ui/profile?email_change=processed`,
        newEmail: 'new@example.com',
      },
      credentials: 'include',
      method: 'POST',
      url: 'https://auth.airi.test/api/auth/change-email',
    })
    expect(onSubmitted).toHaveBeenCalledOnce()
    expect(document.querySelector('dialog, [role="dialog"]')).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('shows new-email verification copy when the current email is unverified', async () => {
    const screen = await renderSection({
      email: 'real-but-unverified@example.com',
      emailVerified: false,
    })

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    await expect.element(screen.getByRole('status')).toHaveTextContent(
      'We sent a verification email to your new email address.',
    )
  })

  it('announces the accepted state without adding the live countdown', async () => {
    const screen = await renderSection()

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    const status = document.querySelector<HTMLElement>('[role="status"]')
    expect(status?.textContent?.trim()).toBe(
      'We sent a confirmation email to your current email address.',
    )
    expect(status?.querySelector('button')).toBeNull()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(status?.textContent?.trim()).toBe(
      'We sent a confirmation email to your current email address.',
    )
    await expect.element(screen.getByRole('button', { name: 'Resend in 59s' })).toBeDisabled()
  })

  it('submits the same native endpoint and target again after the cooldown', async () => {
    const screen = await renderSection()

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    await expect.element(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    await screen.getByRole('button', { name: 'Resend email' }).click()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestBody(fetchMock, 1)).toEqual(requestBody(fetchMock, 0))
    await expect.element(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled()
  })

  it('shows localized errors without server messages', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(
      'EMAIL_CHANGE_EMAIL_UNAVAILABLE',
      'The occupied address and database details must stay private.',
    ))
    const screen = await renderSection()

    await screen.getByRole('textbox', { name: 'New email' }).fill('used@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent(
      'This email address is not available. Use a different email.',
    )
    expect(document.body.textContent).not.toContain('occupied address')
    expect(document.body.textContent).not.toContain('database details')
  })

  it('submits the edited input after an unavailable-address error', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(
        'EMAIL_CHANGE_EMAIL_UNAVAILABLE',
        'Unavailable target details.',
      ))
      .mockResolvedValueOnce(successfulResponse())
    const screen = await renderSection()
    const input = screen.getByRole('textbox', { name: 'New email' })

    await input.fill('unavailable@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()
    await expect.element(screen.getByRole('alert')).toBeVisible()

    await input.fill('available@example.com')
    await screen.getByRole('button', { name: 'Try again' }).click()

    expect(requestBody(fetchMock, 1).body).toEqual({
      callbackURL: `${window.location.origin}/ui/profile?email_change=processed`,
      newEmail: 'available@example.com',
    })
  })

  it('recovers from a failed request with the same target', async () => {
    fetchMock
      .mockResolvedValueOnce(rateLimitResponse())
      .mockResolvedValueOnce(successfulResponse())
    const screen = await renderSection()

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent(
      'Too many emails were sent. Try again later.',
    )
    expect(document.body.textContent).not.toContain('Raw rate-limit message.')

    await screen.getByRole('button', { name: 'Try again' }).click()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestBody(fetchMock, 1)).toEqual(requestBody(fetchMock, 0))
    await expect.element(screen.getByRole('status')).toHaveTextContent(
      'We sent a confirmation email to your current email address.',
    )
  })

  it('stops the local cooldown timer when the section unmounts', async () => {
    const screen = await renderSection()

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()
    expect(vi.getTimerCount()).toBe(1)

    screen.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a pending request that resolves after unmount', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))
    const onSubmitted = vi.fn()
    const screen = await renderSection({ onSubmitted })

    await screen.getByRole('textbox', { name: 'New email' }).fill('new@example.com')
    await screen.getByRole('button', { name: 'Change email' }).click()
    expect(fetchMock).toHaveBeenCalledOnce()

    screen.unmount()
    vi.clearAllTimers()
    expect(vi.getTimerCount()).toBe(0)
    const response = successfulResponse()
    vi.spyOn(response, 'json').mockResolvedValue({ status: true })
    resolveRequest?.(response)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(onSubmitted).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
