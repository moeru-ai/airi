import { postAuthJSON } from './auth-fetch'

/** Input for Better Auth's native email-change endpoint. */
export interface ChangeEmailInput {
  apiServerUrl: string
  newEmail: string
  callbackURL: string
}

/**
 * Sends an email-change request for the signed-in user.
 *
 * A successful response only means that Better Auth accepted the request.
 */
export async function changeEmail(input: ChangeEmailInput): Promise<void> {
  await postAuthJSON(
    input,
    '/change-email',
    {
      newEmail: input.newEmail,
      callbackURL: input.callbackURL,
    },
    () => undefined,
  )
}

/**
 * Parses a Better Auth email-verification callback error.
 *
 * @example
 * parseEmailChangeError('TOKEN_EXPIRED')
 * // => 'TOKEN_EXPIRED'
 */
export function parseEmailChangeError(value: unknown): string | null {
  switch (value) {
    case 'TOKEN_EXPIRED':
    case 'INVALID_TOKEN':
    case 'USER_NOT_FOUND':
    case 'INVALID_USER':
      return value
    default:
      return null
  }
}
