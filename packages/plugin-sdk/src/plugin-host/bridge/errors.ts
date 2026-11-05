import { errorMessageFrom } from '@moeru/std'

import { KitUnavailableError } from '../../kit/errors'
import { KitProviderRegistrationError } from '../kit-capture'

/** Raised by a call from a setup round that ended, for example after a rebuild started. */
export class ExtensionRoundEndedError extends Error {
  readonly code = 'round-ended'

  constructor(readonly round: string, readonly reason: string) {
    super(`The setup round ${round} ended: ${reason}`)
    this.name = 'ExtensionRoundEndedError'
  }
}

/** Raised when a session rebuilds more often in a row than the Host allows. */
export class ExtensionRebuildLimitError extends Error {
  readonly code = 'rebuild-limit'

  constructor(readonly extensionId: string, readonly limit: number) {
    super(`Extension \`${extensionId}\` rebuilt ${limit} times in a row with new Kit dependencies. The session failed.`)
    this.name = 'ExtensionRebuildLimitError'
  }
}

/** Raised when a dynamic module upsert does not complete. */
export class ModuleUpsertError extends Error {
  constructor(
    readonly code: 'upsert-timeout' | 'upsert-superseded' | 'upsert-failed',
    readonly moduleId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ModuleUpsertError'
  }
}

/** An error in a form that structured clone keeps. */
export interface WireError {
  readonly name: string
  readonly message: string
  readonly code?: string
  readonly fields?: Readonly<Record<string, string | number | undefined>>
  readonly errors?: readonly WireError[]
}

/**
 * Converts an error to a form that crosses a worker boundary.
 * The known plugin-sdk errors keep their class and fields.
 */
export function encodeError(error: unknown): WireError {
  if (error instanceof KitUnavailableError)
    return { name: error.name, message: error.message, fields: { kitId: error.kitId, reason: error.reason, detail: error.detail } }
  if (error instanceof KitProviderRegistrationError)
    return { name: error.name, message: error.message, code: error.code, fields: { kitId: error.kitId, extensionId: error.extensionId, sessionId: error.sessionId } }
  if (error instanceof ExtensionRoundEndedError)
    return { name: error.name, message: error.message, code: error.code, fields: { round: error.round, reason: error.reason } }
  if (error instanceof ExtensionRebuildLimitError)
    return { name: error.name, message: error.message, code: error.code, fields: { extensionId: error.extensionId, limit: error.limit } }
  if (error instanceof ModuleUpsertError)
    return { name: error.name, message: error.message, code: error.code, fields: { moduleId: error.moduleId } }
  if (error instanceof AggregateError)
    return { name: error.name, message: error.message, errors: error.errors.map(encodeError) }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return { name: error.name, message: error.message, code: typeof code === 'string' ? code : undefined }
  }
  return { name: 'Error', message: errorMessageFrom(error) ?? 'Unknown error.' }
}

function stringField(wire: WireError, name: string): string {
  return String(wire.fields?.[name] ?? '')
}

/** Restores an error from {@link encodeError}. */
export function decodeError(wire: WireError): Error {
  switch (wire.name) {
    case 'KitUnavailableError':
      return new KitUnavailableError(
        stringField(wire, 'kitId'),
        stringField(wire, 'reason') as KitUnavailableError['reason'],
        wire.fields?.detail === undefined ? undefined : stringField(wire, 'detail'),
      )
    case 'KitProviderRegistrationError':
      return new KitProviderRegistrationError(
        wire.code as KitProviderRegistrationError['code'],
        stringField(wire, 'kitId'),
        wire.fields?.extensionId === undefined ? undefined : stringField(wire, 'extensionId'),
        wire.fields?.sessionId === undefined ? undefined : stringField(wire, 'sessionId'),
      )
    case 'ExtensionRoundEndedError':
      return new ExtensionRoundEndedError(stringField(wire, 'round'), stringField(wire, 'reason'))
    case 'ExtensionRebuildLimitError':
      return new ExtensionRebuildLimitError(stringField(wire, 'extensionId'), Number(wire.fields?.limit ?? 0))
    case 'ModuleUpsertError':
      return new ModuleUpsertError(wire.code as ModuleUpsertError['code'], stringField(wire, 'moduleId'), wire.message)
    case 'AggregateError':
      return new AggregateError((wire.errors ?? []).map(decodeError), wire.message)
    default: {
      const error = new Error(wire.message)
      error.name = wire.name
      if (wire.code)
        Object.assign(error, { code: wire.code })
      return error
    }
  }
}
