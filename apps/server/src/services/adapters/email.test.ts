import { describe, expect, it, vi } from 'vitest'

import { createEmailService } from './email'

describe('emailService', () => {
  it('passes the survey invite idempotency key to Resend', async () => {
    const send = vi.fn(async () => ({ data: { id: 'email_1' }, error: null, headers: null }))

    const service = createEmailService({
      apiKey: 're_test',
      fromEmail: 'noreply@example.com',
      fromName: 'Project AIRI',
    }, undefined, undefined, () => ({ emails: { send } }))

    await service.sendCommunitySurveyInvite({
      to: 'paid@example.com',
      subject: '__configured_subject__',
      html: '<p>__configured_html__</p>',
      text: '__configured_text__',
      idempotencyKey: 'community-survey:user-1',
    })

    expect(send).toHaveBeenCalledWith(
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
