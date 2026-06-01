import { describe, expect, it, vi } from 'vitest'

import { createEmailService } from './email'

const resendMock = vi.hoisted(() => {
  const send = vi.fn()

  return {
    send,
    Resend: vi.fn(class ResendMock {
      emails = {
        send,
      }
    }),
  }
})

vi.mock('resend', () => ({
  Resend: resendMock.Resend,
}))

describe('emailService', () => {
  it('passes the survey invite idempotency key to Resend', async () => {
    resendMock.send.mockResolvedValueOnce({ data: { id: 'email_1' }, error: null })

    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
      fromName: 'Project AIRI',
    })

    await service.sendCommunitySurveyInvite({
      to: 'paid@example.com',
      subject: '__configured_subject__',
      html: '<p>__configured_html__</p>',
      text: '__configured_text__',
      idempotencyKey: 'community-survey:user-1',
    })

    expect(resendMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['paid@example.com'],
        subject: '__configured_subject__',
        html: '<p>__configured_html__</p>',
        text: '__configured_text__',
      }),
      { idempotencyKey: 'community-survey:user-1' },
    )
  })
})
