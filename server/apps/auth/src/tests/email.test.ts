import { useLogger } from '@guiiai/logg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmailService, isPlaceholderEmail } from '../email'

const { resendSend } = vi.hoisted(() => ({
  resendSend: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class Resend {
    emails = { send: resendSend }
  },
}))

function createTestLogger(context: string) {
  const logger = useLogger(context)
  const withFields = vi.spyOn(logger, 'withFields').mockImplementation(() => logger)
  const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})

  return { errorLog, logger, withFields }
}

describe('email messages', () => {
  beforeEach(() => {
    resendSend.mockReset()
    resendSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
  })

  it('identifies a placeholder recipient after normalization', () => {
    expect(isPlaceholderEmail('  USER@APPLE.PLACEHOLDER.LOCAL  ')).toBe(true)
    expect(isPlaceholderEmail('user@example.com')).toBe(false)
  })

  it('keeps placeholder recipients outside the email provider boundary', async () => {
    const service = createEmailService({
      apiKey: 'resend-test-key',
      fromEmail: 'noreply@airi.example',
      fromName: 'Project AIRI',
    })

    await service.send({
      to: 'direct@system.local',
      subject: 'Direct message',
      html: '<p>Direct message</p>',
      text: 'Direct message',
    })
    await service.sendPasswordReset({
      to: 'password@system.local',
      url: 'https://auth.airi.example/reset?token=password-token',
    })
    await service.sendMagicLink({
      to: 'magic@system.local',
      url: 'https://auth.airi.example/magic?token=magic-token',
    })
    await service.sendDeleteAccountVerification({
      to: 'delete@system.local',
      url: 'https://auth.airi.example/delete?token=delete-token',
    })

    expect(resendSend).not.toHaveBeenCalled()
  })

  it('sends the native change-email confirmation to the current address', async () => {
    const service = createEmailService({
      apiKey: 'resend-test-key',
      fromEmail: 'noreply@airi.example',
      fromName: 'Project AIRI',
    })

    await service.sendChangeEmailConfirmation({
      to: 'current@example.com',
      newEmail: 'new@example.com',
      url: 'https://auth.airi.example/api/auth/change-email/confirm?token=confirmation-token',
    })

    expect(resendSend).toHaveBeenCalledOnce()
    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({
      to: ['current@example.com'],
      subject: 'Confirm your new email address for Project AIRI',
      html: expect.stringContaining('new@example.com'),
      text: expect.stringContaining('confirmation-token'),
    }))
    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('new@example.com'),
    }))
    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('If you did not request this change'),
      text: expect.stringContaining('If you did not request this change'),
    }))
  })

  it('omits email-change secrets from a provider-error log', async () => {
    const { errorLog, logger, withFields } = createTestLogger('email-test-provider-error')
    resendSend.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'application_error',
        message: 'Provider rejected current@example.com for new@example.com at https://auth.airi.example/verify?token=confirmation-token.',
      },
    })
    const service = createEmailService({
      apiKey: 'resend-test-key',
      fromEmail: 'noreply@airi.example',
      fromName: 'Project AIRI',
    }, logger)

    await expect(service.sendChangeEmailConfirmation({
      to: 'current@example.com',
      newEmail: 'new@example.com',
      url: 'https://auth.airi.example/api/auth/verify-email?token=confirmation-token',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'email/send_failed',
      details: { providerError: 'application_error' },
    })

    expect(withFields).toHaveBeenCalledWith({
      template: 'change_email',
      errorName: 'application_error',
    })
    expect(errorLog).toHaveBeenCalledWith('Email provider rejected the message.')
    const loggedData = JSON.stringify({ fields: withFields.mock.calls, messages: errorLog.mock.calls })
    expect(loggedData).not.toContain('current@example.com')
    expect(loggedData).not.toContain('new@example.com')
    expect(loggedData).not.toContain('confirmation-token')
    expect(loggedData).not.toContain('https://auth.airi.example/verify')
  })

  it('omits email-change secrets from an unexpected-error log', async () => {
    const { errorLog, logger, withFields } = createTestLogger('email-test-unexpected-error')
    resendSend.mockRejectedValueOnce(new Error(
      'Network failure for current@example.com and new@example.com at https://auth.airi.example/verify?token=confirmation-token.',
    ))
    const service = createEmailService({
      apiKey: 'resend-test-key',
      fromEmail: 'noreply@airi.example',
      fromName: 'Project AIRI',
    }, logger)

    await expect(service.sendChangeEmailConfirmation({
      to: 'current@example.com',
      newEmail: 'new@example.com',
      url: 'https://auth.airi.example/api/auth/verify-email?token=confirmation-token',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'email/send_failed',
    })

    expect(withFields).toHaveBeenCalledWith({
      template: 'change_email',
      errorName: 'Error',
    })
    expect(errorLog).toHaveBeenCalledWith('Email provider request failed.')
    const loggedData = JSON.stringify({ fields: withFields.mock.calls, messages: errorLog.mock.calls })
    expect(loggedData).not.toContain('current@example.com')
    expect(loggedData).not.toContain('new@example.com')
    expect(loggedData).not.toContain('confirmation-token')
    expect(loggedData).not.toContain('https://auth.airi.example/verify')
  })
})
