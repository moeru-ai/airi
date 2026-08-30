import type {
  FetchTransportPort,
  ModelDiscoveryResult,
  ModelGenerationValidationResult,
  ModelRuntimeConnection,
  ModelRuntimePort,
  ModelRuntimeValidationInput,
} from '@proj-airi/core-agent'

import type { CustomModelConnectionConfig } from './config'

import {
  createCustomModelRuntime,
  ModelConnectionError,
} from '@proj-airi/core-agent'

import {
  buildCustomModelRequestUrl,
  mergeCustomModelHeaders,
  validateCustomModelConnection,
} from './config'
import { createCustomModelFetchTransport } from './transport'

export interface CreateCustomModelRuntimeOptions {
  /** Stable connection instance id used as the runtime isolation key. */
  connectionId: string
  /**
   * Platform transport. Tests fake this port.
   *
   * @default Web direct fetch, or the registered Electron Eventa transport
   */
  transport?: FetchTransportPort
  /**
   * When false, an empty model list is valid. Discovery uses this path.
   *
   * @default true
   */
  requireModels?: boolean
  /**
   * When false, a missing API Key is valid. Discovery uses this path.
   *
   * @default true
   */
  requireAuth?: boolean
}

/**
 * Resolves a validated custom model connection into a runtime snapshot.
 *
 * The snapshot contains the final generation URL, optional model-list URL,
 * and merged headers. Protocol adapters never rebuild these values.
 */
export function resolveCustomModelRuntimeConnection(
  config: CustomModelConnectionConfig,
  connectionId: string,
  options: Pick<CreateCustomModelRuntimeOptions, 'requireModels' | 'requireAuth'> = {},
): ModelRuntimeConnection {
  const validated = validateCustomModelConnection(config, options)
  if (!validated.success) {
    throw new ModelConnectionError({
      stage: 'config',
      code: 'invalid-config',
      message: `Invalid custom model connection (${validated.code}) at ${validated.field}.`,
      retryable: false,
    })
  }

  const headers = mergeCustomModelHeaders({
    protocol: validated.output.protocol,
    protocolOptions: validated.output.protocolOptions,
    auth: validated.output.auth,
    user: validated.output.headers,
  })
  if (!headers.success) {
    throw new ModelConnectionError({
      stage: 'config',
      code: 'invalid-config',
      message: `Invalid custom model connection (${headers.code}) at ${headers.field}.`,
      retryable: false,
    })
  }

  return {
    connectionId,
    protocol: validated.output.protocol,
    generationUrl: buildCustomModelRequestUrl(
      validated.output.baseUrl,
      validated.output.generationPath,
    ),
    ...(validated.output.modelListPath
      ? {
          modelListUrl: buildCustomModelRequestUrl(
            validated.output.baseUrl,
            validated.output.modelListPath,
          ),
        }
      : {}),
    headers: headers.headers,
  }
}

/**
 * Creates the protocol runtime for one custom model connection.
 *
 * Generation tests and live chat must call this factory so they share the
 * selected protocol adapter and Fetch Transport Port.
 */
export function createCustomModelRuntimeFromConfig(
  config: CustomModelConnectionConfig,
  options: CreateCustomModelRuntimeOptions,
): ModelRuntimePort {
  const connection = resolveCustomModelRuntimeConnection(config, options.connectionId, {
    requireModels: options.requireModels,
    requireAuth: options.requireAuth,
  })
  return createCustomModelRuntime(
    connection,
    options.transport ?? createCustomModelFetchTransport(),
  )
}

/**
 * Lists models for one custom connection through the selected protocol runtime.
 *
 * Discovery does not decide whether generation can run.
 */
export async function discoverCustomModelModels(
  config: CustomModelConnectionConfig,
  options: CreateCustomModelRuntimeOptions & { abortSignal?: AbortSignal },
): Promise<ModelDiscoveryResult> {
  const runtime = createCustomModelRuntimeFromConfig(config, {
    ...options,
    requireModels: false,
    requireAuth: false,
  })
  return runtime.discover({ abortSignal: options.abortSignal })
}

/**
 * Sends a minimal generation request with the selected model.
 *
 * The request uses the same adapter and transport as live generation.
 */
export async function validateCustomModelGeneration(
  config: CustomModelConnectionConfig,
  options: CreateCustomModelRuntimeOptions & ModelRuntimeValidationInput,
): Promise<ModelGenerationValidationResult> {
  const runtime = createCustomModelRuntimeFromConfig(config, options)
  return runtime.validateGeneration({
    model: options.model,
    abortSignal: options.abortSignal,
  })
}
