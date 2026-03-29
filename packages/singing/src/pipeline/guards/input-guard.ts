import type { CreateCoverRequest } from '../../types/request'

import { existsSync } from 'node:fs'

import { ConverterBackendId, SeparatorBackendId } from '../../constants/model-backends'
import { SingingError, SingingErrorCode } from '../../contracts/error'

/**
 * Guard: validates a cover request before pipeline execution.
 * Throws SingingError if validation fails.
 */
export function validateCoverRequest(request: CreateCoverRequest): void {
  if (!request.inputUri) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      'inputUri is required',
    )
  }

  if (!existsSync(request.inputUri)) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Input file does not exist: ${request.inputUri}`,
    )
  }

  if (!['rvc', 'seedvc'].includes(request.mode)) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Unsupported mode: ${request.mode}`,
    )
  }

  const validSeparators = Object.values(SeparatorBackendId) as string[]
  if (!validSeparators.includes(request.separator.backend)) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Unknown separator backend: ${request.separator.backend}`,
    )
  }

  const validConverters = Object.values(ConverterBackendId) as string[]
  if (!validConverters.includes(request.converter.backend)) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Unknown converter backend: ${request.converter.backend}`,
    )
  }

  if (request.mode === 'rvc' && request.converter.backend === 'rvc') {
    if (!('voiceId' in request.converter) || !request.converter.voiceId) {
      throw new SingingError(
        SingingErrorCode.InvalidInput,
        'voiceId is required for RVC mode',
      )
    }
  }
}
