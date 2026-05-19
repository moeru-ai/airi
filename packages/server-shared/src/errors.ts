export const ServerErrorMessages = {
  invalidEventFormat: 'invalid event format',
  invalidToken: 'invalid token',
  mustAuthenticateBeforeAnnouncing: 'must authenticate before announcing',
  moduleAnnounceIdentityInvalid: 'module identity must include kind=plugin and a plugin id for event \'module:announce\'',
  moduleAnnounceIndexInvalid: 'the field \'index\' must be a non-negative integer for event \'module:announce\'',
  moduleAnnounceNameInvalid: 'the field \'name\' must be a non-empty string for event \'module:announce\'',
  moduleConsumerEventInvalid: 'the field \'event\' must be a non-empty string for event consumer registration',
  moduleNotFound: 'module not found, it hasn\'t announced itself or the name is incorrect',
  noConsumerRegistered: 'no consumer registered for requested event delivery',
  notAuthenticated: 'not authenticated',
  uiConfigureModuleIndexInvalid: 'the field \'moduleIndex\' must be a non-negative integer for event \'ui:configure\'',
  uiConfigureModuleNameInvalid: 'the field \'moduleName\' can\'t be empty for event \'ui:configure\'',
} as const

export type ServerErrorCode
  = | 'invalid-event-format'
    | 'invalid-json'
    | 'invalid-token'
    | 'module-announce-identity-invalid'
    | 'module-announce-index-invalid'
    | 'module-announce-name-invalid'
    | 'module-consumer-event-invalid'
    | 'module-not-found'
    | 'must-authenticate-before-announcing'
    | 'no-consumer-registered'
    | 'not-authenticated'
    | 'ui-configure-module-index-invalid'
    | 'ui-configure-module-name-invalid'
    | 'unknown'

export interface ParsedServerErrorMessage {
  authentication: boolean
  code: ServerErrorCode
  message: string
  recoverable: boolean
  terminal: boolean
}

export function createInvalidJsonServerErrorMessage(errorMessage: string) {
  return `invalid JSON, error: ${errorMessage}`
}

/**
 * Error metadata registry for predictable error code classification.
 * Maps error messages to their error code and classification properties.
 * @internal
 */
const errorMetadataRegistry: Record<string, Omit<ParsedServerErrorMessage, 'message'>> = {
  [ServerErrorMessages.invalidToken]: {
    authentication: true,
    code: 'invalid-token',
    recoverable: false,
    terminal: true,
  },
  [ServerErrorMessages.notAuthenticated]: {
    authentication: true,
    code: 'not-authenticated',
    recoverable: true,
    terminal: false,
  },
  [ServerErrorMessages.mustAuthenticateBeforeAnnouncing]: {
    authentication: true,
    code: 'must-authenticate-before-announcing',
    recoverable: true,
    terminal: false,
  },
  [ServerErrorMessages.invalidEventFormat]: {
    authentication: false,
    code: 'invalid-event-format',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.moduleAnnounceNameInvalid]: {
    authentication: false,
    code: 'module-announce-name-invalid',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.moduleAnnounceIndexInvalid]: {
    authentication: false,
    code: 'module-announce-index-invalid',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.moduleAnnounceIdentityInvalid]: {
    authentication: false,
    code: 'module-announce-identity-invalid',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.moduleNotFound]: {
    authentication: false,
    code: 'module-not-found',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.moduleConsumerEventInvalid]: {
    authentication: false,
    code: 'module-consumer-event-invalid',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.noConsumerRegistered]: {
    authentication: false,
    code: 'no-consumer-registered',
    recoverable: true,
    terminal: false,
  },
  [ServerErrorMessages.uiConfigureModuleNameInvalid]: {
    authentication: false,
    code: 'ui-configure-module-name-invalid',
    recoverable: false,
    terminal: false,
  },
  [ServerErrorMessages.uiConfigureModuleIndexInvalid]: {
    authentication: false,
    code: 'ui-configure-module-index-invalid',
    recoverable: false,
    terminal: false,
  },
}

/**
 * Parses a server error message and classifies it.
 *
 * Use when:
 * - Receiving error messages from the server
 * - Determining whether to retry or give up
 * - Checking if the error is authentication-related
 *
 * Expects:
 * - Message string that matches one of ServerErrorMessages or starts with 'invalid JSON, error: '
 *
 * Returns:
 * - Parsed error with classification (code, authentication, recoverable, terminal)
 */
export function parseServerErrorMessage(message: string): ParsedServerErrorMessage {
  const metadata = Object.hasOwn(errorMetadataRegistry, message)
    ? errorMetadataRegistry[message]
    : undefined
  if (metadata) {
    return { ...metadata, message }
  }

  if (message.startsWith('invalid JSON, error: ')) {
    return {
      authentication: false,
      code: 'invalid-json',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  return {
    authentication: false,
    code: 'unknown',
    message,
    recoverable: false,
    terminal: false,
  }
}

/**
 * Checks if a server error message is authentication-related.
 */
export function isAuthenticationServerErrorMessage(message: string) {
  return parseServerErrorMessage(message).authentication
}

/**
 * Checks if a server error message is a terminal authentication error.
 * Terminal errors should not be retried.
 */
export function isTerminalAuthenticationServerErrorMessage(message: string) {
  const parsed = parseServerErrorMessage(message)
  return parsed.authentication && parsed.terminal
}
