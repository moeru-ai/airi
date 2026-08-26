const linkedAccountOAuthErrorMessageKeys: Record<string, string> = {
  account_already_linked_to_different_user: 'settings.pages.account.connections.error.accountAlreadyLinkedToDifferentUser',
}

/**
 * Resolves Better Auth OAuth-link callback errors to settings-page i18n keys.
 *
 * Use when:
 * - A link-social callback redirects back to an account settings page with
 *   `?error=...`.
 *
 * Expects:
 * - `errorCode` is the raw query-string value from Better Auth.
 *
 * Returns:
 * - A specific localized message key for known errors.
 * - A generic localized message key for unknown non-empty errors.
 * - `null` when there is no error to show.
 */
export function resolveLinkedAccountOAuthErrorMessageKey(errorCode: string | null | undefined): string | null {
  if (!errorCode)
    return null

  return linkedAccountOAuthErrorMessageKeys[errorCode]
    ?? 'settings.pages.account.connections.error.oauthCallbackFailed'
}
