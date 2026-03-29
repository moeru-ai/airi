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

export function parseServerErrorMessage(message: string): ParsedServerErrorMessage {
  if (message === ServerErrorMessages.invalidToken) {
    return {
      authentication: true,
      code: 'invalid-token',
      message,
      recoverable: false,
      terminal: true,
    }
  }

  if (message === ServerErrorMessages.notAuthenticated) {
    return {
      authentication: true,
      code: 'not-authenticated',
      message,
      recoverable: true,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.mustAuthenticateBeforeAnnouncing) {
    return {
      authentication: true,
      code: 'must-authenticate-before-announcing',
      message,
      recoverable: true,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.invalidEventFormat) {
    return {
      authentication: false,
      code: 'invalid-event-format',
      message,
      recoverable: false,
      terminal: false,
    }
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

  if (message === ServerErrorMessages.moduleAnnounceNameInvalid) {
    return {
      authentication: false,
      code: 'module-announce-name-invalid',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.moduleAnnounceIndexInvalid) {
    return {
      authentication: false,
      code: 'module-announce-index-invalid',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.moduleAnnounceIdentityInvalid) {
    return {
      authentication: false,
      code: 'module-announce-identity-invalid',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.moduleNotFound) {
    return {
      authentication: false,
      code: 'module-not-found',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.moduleConsumerEventInvalid) {
    return {
      authentication: false,
      code: 'module-consumer-event-invalid',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.noConsumerRegistered) {
    return {
      authentication: false,
      code: 'no-consumer-registered',
      message,
      recoverable: true,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.uiConfigureModuleNameInvalid) {
    return {
      authentication: false,
      code: 'ui-configure-module-name-invalid',
      message,
      recoverable: false,
      terminal: false,
    }
  }

  if (message === ServerErrorMessages.uiConfigureModuleIndexInvalid) {
    return {
      authentication: false,
      code: 'ui-configure-module-index-invalid',
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

export function isAuthenticationServerErrorMessage(message: string) {
  return parseServerErrorMessage(message).authentication
}

export function isTerminalAuthenticationServerErrorMessage(message: string) {
  const parsed = parseServerErrorMessage(message)
  return parsed.authentication && parsed.terminal
}
