/**
 * Re-export base provider interfaces for convenience
 *
 * Note: ProviderValidationResult is not re-exported here to avoid conflicts
 * with the existing type in ./types. Import it directly from './base-types' if needed.
 */

export * from './base-speech'
export * from './base-transcription'
