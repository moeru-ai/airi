import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const send = vi.fn()
  const Resend = vi.fn(() => ({
    emails: {
      send,
    },
  }))

  return {
    Resend,
    send,
  }
})

vi.mock('resend', () => ({
  Resend: mocks.Resend,
}))

const { createEmailService } = await import('./email')

function createLogger() {
  const error = vi.fn()
  const withFields = vi.fn(() => ({ error }))

  return {
    error,
    logger: {
      withFields,
    } as Parameters<typeof createEmailService>[1],
    withFields,
  }
}

function createMetrics() {
  return {
    duration: {
      record: vi.fn(),
    },
    failures: {
      add: vi.fn(),
    },
    send: {
      add: vi.fn(),
    },
  } as NonNullable<Parameters<typeof createEmailService>[2]>
}

describe('createEmailService', () => {
  beforeEach(() => {
    mocks.Resend.mockClear()
    mocks.send.mockReset()
  })

  it('fails visibly when RESEND_API_KEY is missing and keeps Resend lazy', async () => {
    const { logger } = createLogger()
    const service = createEmailService({
      apiKey: '',
      fromEmail: 'noreply@example.com',
    }, logger)

    await expect(service.send({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'email/service_not_configured',
      message: 'Email service not configured (RESEND_API_KEY is missing).',
    })

    expect(mocks.Resend).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('sends payloads through Resend with formatted From header and success metrics', async () => {
    mocks.send.mockResolvedValueOnce({ data: { id: 'email-1' }, error: null })
    const { logger } = createLogger()
    const metrics = createMetrics()
    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
      fromName: 'Project AIRI',
    }, logger, metrics)

    await service.send({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })

    expect(mocks.Resend).toHaveBeenCalledWith('re_test')
    expect(mocks.send).toHaveBeenCalledWith({
      from: 'Project AIRI <noreply@example.com>',
      to: ['user@example.com'],
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })
    expect(metrics.send.add).toHaveBeenCalledWith(1, { template: 'unknown' })
    expect(metrics.duration.record).toHaveBeenCalledWith(expect.any(Number), {
      template: 'unknown',
      outcome: 'ok',
    })
  })

  it('throws provider errors as email/send_failed and records failure metrics', async () => {
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'validation_error',
        message: 'invalid recipient',
      },
    })
    const { error, logger, withFields } = createLogger()
    const metrics = createMetrics()
    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
    }, logger, metrics)

    await expect(service.send({
      to: 'bad-address',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'email/send_failed',
      message: 'invalid recipient',
      details: { providerError: 'validation_error' },
    })

    expect(withFields).toHaveBeenCalledWith({
      to: 'bad-address',
      subject: 'Subject',
      errorName: 'validation_error',
    })
    expect(error).toHaveBeenCalledWith('invalid recipient')
    expect(metrics.failures.add).toHaveBeenCalledWith(1, {
      template: 'unknown',
      error_name: 'validation_error',
    })
    expect(metrics.duration.record).toHaveBeenCalledWith(expect.any(Number), {
      template: 'unknown',
      outcome: 'error',
    })
  })

  it('wraps unexpected send failures and protects caller from raw provider throws', async () => {
    mocks.send.mockRejectedValueOnce(new Error('socket closed'))
    const { error, logger, withFields } = createLogger()
    const metrics = createMetrics()
    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
    }, logger, metrics)

    await expect(service.send({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'email/send_failed',
      message: 'socket closed',
    })

    expect(withFields).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Subject',
    })
    expect(error).toHaveBeenCalledWith('socket closed')
    expect(metrics.failures.add).toHaveBeenCalledWith(1, {
      template: 'unknown',
      error_name: 'unhandled',
    })
    expect(metrics.duration.record).toHaveBeenCalledWith(expect.any(Number), {
      template: 'unknown',
      outcome: 'error',
    })
  })

  it('renders high-level Better Auth email templates into Resend payloads', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const { logger } = createLogger()
    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
    }, logger)

    await service.sendVerification({ to: 'user@example.com', url: 'https://app.example.com/verify' })
    await service.sendPasswordReset({ to: 'user@example.com', url: 'https://app.example.com/reset' })
    await service.sendMagicLink({ to: 'user@example.com', url: 'https://app.example.com/magic' })
    await service.sendChangeEmailConfirmation({
      to: 'user@example.com',
      newEmail: '<new@example.com>',
      url: 'https://app.example.com/change',
    })
    await service.sendDeleteAccountVerification({ to: 'user@example.com', url: 'https://app.example.com/delete' })

    expect(mocks.send).toHaveBeenCalledTimes(5)
    expect(mocks.send.mock.calls.map(([payload]) => payload.subject)).toEqual([
      'Verify your email for Project AIRI',
      'Reset your Project AIRI password',
      'Your Project AIRI sign-in link',
      'Confirm your new email address for Project AIRI',
      'Confirm account deletion for Project AIRI',
    ])

    const changeEmailPayload = mocks.send.mock.calls[3][0]
    expect(changeEmailPayload.html).toContain('&lt;new@example.com&gt;')
    expect(changeEmailPayload.text).toContain('<new@example.com>')

    const deletePayload = mocks.send.mock.calls[4][0]
    expect(deletePayload.html).toContain('This cannot be undone')
    expect(deletePayload.text).toContain('This cannot be undone')
  })
})
