/**
 * Standardized error codes for the singing pipeline.
 */
export enum SingingErrorCode {
  InvalidInput = 'SINGING_INVALID_INPUT',
  UnsupportedFormat = 'SINGING_UNSUPPORTED_FORMAT',
  SeparationFailed = 'SINGING_SEPARATION_FAILED',
  PitchExtractionFailed = 'SINGING_PITCH_EXTRACTION_FAILED',
  ConversionFailed = 'SINGING_CONVERSION_FAILED',
  RemixFailed = 'SINGING_REMIX_FAILED',
  ModelNotFound = 'SINGING_MODEL_NOT_FOUND',
  VoiceNotFound = 'SINGING_VOICE_NOT_FOUND',
  PythonWorkerError = 'SINGING_PYTHON_WORKER_ERROR',
  JobNotFound = 'SINGING_JOB_NOT_FOUND',
  JobAlreadyCancelled = 'SINGING_JOB_ALREADY_CANCELLED',
  StorageError = 'SINGING_STORAGE_ERROR',
}

/**
 * Structured error thrown by singing pipeline operations.
 */
export class SingingError extends Error {
  constructor(
    public readonly code: SingingErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SingingError'
  }
}
