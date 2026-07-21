import { describe, expect, it } from 'vitest'

import { resolveLinkedAccountOAuthErrorMessageKey } from './linked-account-errors'

describe('resolveLinkedAccountOAuthErrorMessageKey', () => {
  it('maps account_already_linked_to_different_user to the specific i18n key', () => {
    expect(resolveLinkedAccountOAuthErrorMessageKey('account_already_linked_to_different_user')).toBe(
      'settings.pages.account.connections.error.accountAlreadyLinkedToDifferentUser',
    )
  })

  it('maps unknown OAuth callback errors to the fallback i18n key', () => {
    expect(resolveLinkedAccountOAuthErrorMessageKey('unexpected_provider_error')).toBe(
      'settings.pages.account.connections.error.oauthCallbackFailed',
    )
  })

  it('ignores missing OAuth callback errors', () => {
    expect(resolveLinkedAccountOAuthErrorMessageKey(undefined)).toBeNull()
    expect(resolveLinkedAccountOAuthErrorMessageKey('')).toBeNull()
  })
})
