import type { generateTranscription } from '@xsai/generate-transcription'
import type { ConfigHookPlugin, MatrixDefinition, ModelDefinition, TaskRunContext } from 'vieval/config'

import process from 'node:process'

import { resolveModelByName } from 'vieval/config'
import { envFrom, requiredEnvFrom } from 'vieval/core/inference-executors'

// WORKAROUND:
// This module is one file, unlike `chat-models`, which splits its runtime config into its own module.
// Configs import it, and vieval 0.4.0 loads configs with Node type stripping, which cannot follow an extensionless relative import.
// Source: see eval/index.ts.
// Remove when vieval loads configs with an extension-resolving loader, or when this module moves into vieval.
//
// This module mirrors `vieval/plugins/chat-models` for speech. It depends only on the public vieval API,
// so it can move into vieval as `vieval/plugins/speech-models`.

/**
 * What a speech model does. A `speech` model synthesizes speech from text (TTS).
 * A `transcription` model turns speech into text (ASR).
 */
export type SpeechModelCapability = 'speech' | 'transcription'

/**
 * One provider definition that speech models reference by id.
 *
 * A provider is an OpenAI-compatible endpoint (`POST /audio/speech` and `POST /audio/transcriptions`), which most TTS and
 * ASR services expose, for example unspeech and a whisper.cpp server. A transcription provider can instead be a
 * {@link TranscriptionExecutor}, for example a native speech recognizer.
 */
export interface SpeechProviderDefinition {
  /**
   * Stable provider id referenced by `speechModelFrom({ provider })`.
   */
  id: string
  inferenceExecutor: 'openai' | TranscriptionExecutor
  /**
   * Optional provider parameters resolved from env.
   *
   * Expects:
   * - map key is the provider parameter name, for example `apiKey`
   * - map value is the env key name
   */
  optionalEnv?: Record<string, string>
  /**
   * Literal provider parameters.
   */
  parameters?: Record<string, unknown>
  /**
   * Required provider parameters resolved from env. A missing key throws when the config loads.
   *
   * Expects:
   * - map key is the provider parameter name, for example `baseURL`
   * - map value is the env key name
   */
  requiredEnv?: Record<string, string>
}

/**
 * xsai request options of one transcription call. A runtime without an HTTP endpoint provides its own `fetch`,
 * as xsai providers do, so callers send every model the same `generateTranscription` request.
 */
export interface TranscriptionRequestOptions {
  apiKey?: string
  baseURL: string | URL
  /** The `fetch` of an xsai provider, so the same type serves every provider. */
  fetch?: Parameters<typeof generateTranscription>[0]['fetch']
  model: string
}

/**
 * A transcription runtime that is not an OpenAI-compatible endpoint, for example Apple Speech on macOS.
 */
export interface TranscriptionExecutor {
  /** Stable id, used as the `inferenceExecutorId` of its models. */
  id: string
  /**
   * Builds the request options of one call. `language` is the language that the caller passes to `generateTranscription`,
   * so a runtime that needs one recognizer per language, for example per locale, can select it.
   * `parameters` are the provider and model parameters, with env already resolved. An executor that wraps an HTTP API
   * that is not OpenAI-compatible reads its endpoint and key from them.
   */
  transcription: (options: { language?: string, model: string, parameters: Readonly<Record<string, unknown>> }) => TranscriptionRequestOptions
}

/**
 * Speech-model specialization of the canonical `ModelDefinition`.
 * The capability and the voices are in `parameters`, so the model stays in the shared `config.models` registry.
 */
export type SpeechModelDefinition = Omit<ModelDefinition, 'inferenceExecutor'> & {
  inferenceExecutor: 'openai' | TranscriptionExecutor
  provider: string
}

interface SpeechModelFromBaseOptions {
  /**
   * Alias names used by matrix lookup.
   */
  aliases?: string[]
  /**
   * Stable model id. Matrix axes select the model by this id, its model name, or an alias.
   *
   * @default `openai:<model>`
   */
  id?: string
  /**
   * Concrete model name sent to the provider.
   */
  model: string
  /**
   * Literal model parameters. They override provider parameters with the same name.
   */
  parameters?: Record<string, unknown>
  /**
   * Provider id from `SpeechProviders`.
   */
  provider: string
}

/**
 * Builder input for `speechModelFrom`.
 */
export interface SpeechModelFromOptions extends SpeechModelFromBaseOptions {
  /**
   * The endpoint takes the language of the text as a BCP 47 tag in `extra_body.language`, as the AIRI speech API does.
   * Without it, a provider guesses the language, and a voice can read a short text, such as a digit, in its own language.
   *
   * @default false
   */
  sendsLanguage?: boolean
  /**
   * The voice for any language that `voices` does not name.
   */
  voice?: string
  /**
   * The voice of each language, keyed by the language code that eval code passes to `voiceFor`.
   */
  voices?: Record<string, string>
}

/**
 * Builder input for `transcriptionModelFrom`.
 */
export interface TranscriptionModelFromOptions extends SpeechModelFromBaseOptions {}

export interface SpeechModelsPluginOptions {
  /**
   * Speech and transcription model definitions to append to `config.models`.
   */
  models: readonly SpeechModelDefinition[]
}

export interface SpeechProvidersPluginOptions {
  /**
   * Env source for env-backed provider parameters.
   *
   * @default config.env, then process.env
   */
  env?: NodeJS.ProcessEnv
  providers: readonly SpeechProviderDefinition[]
}

/**
 * Partial config shape that the speech plugins read and write.
 */
export interface SpeechPluginConfig {
  env?: NodeJS.ProcessEnv
  models?: ModelDefinition[]
  speechProviders?: SpeechProviderDefinition[]
}

export type SpeechPlugin = ConfigHookPlugin<SpeechPluginConfig>

export type MatrixModelScope = 'eval' | 'run'

export interface SpeechModelFromMatrixOptions {
  /**
   * Matrix axis whose selected value is a model id, model name, or alias.
   */
  axis: string
}

type MatrixModelContext = Pick<TaskRunContext, 'models' | 'task'>

/**
 * Builds one speech-provider definition.
 *
 * Use when:
 * - several speech or transcription models share one endpoint and key
 */
export function speechProviderFrom(options: SpeechProviderDefinition): SpeechProviderDefinition {
  return { ...options }
}

/**
 * Builds one TTS model definition.
 *
 * Use when:
 * - a run or eval matrix axis selects the TTS model, for example to compare providers
 */
export function speechModelFrom(options: SpeechModelFromOptions): SpeechModelDefinition {
  return createModelDefinition(options, {
    capability: 'speech',
    sendsLanguage: options.sendsLanguage ?? false,
    voice: options.voice,
    voices: options.voices ?? {},
  })
}

/**
 * Builds one ASR model definition.
 *
 * Use when:
 * - a matrix axis selects the speech recognition model, for example as part of the evaluator
 */
export function transcriptionModelFrom(options: TranscriptionModelFromOptions): SpeechModelDefinition {
  return createModelDefinition(options, { capability: 'transcription' })
}

/**
 * Creates a matrix axis from configured speech model names.
 *
 * Returns:
 * - matrix axis object compatible with `runMatrix.extend/override` and `evalMatrix.extend/override`
 */
export function speechModelMatrix(axis: string, ...names: string[]): MatrixDefinition {
  return { [axis]: Array.from(new Set(names)) }
}

/**
 * Contributes speech providers to config and resolves their env-backed parameters.
 * Register it before `SpeechModels`, which reads the providers.
 */
export function SpeechProviders(options: SpeechProvidersPluginOptions): SpeechPlugin {
  return {
    configVieval(config) {
      const env = config.env ?? options.env ?? process.env
      return {
        ...config,
        speechProviders: [
          ...(config.speechProviders ?? []),
          ...options.providers.map(provider => ({ ...provider, parameters: resolveProviderParameters(provider, env) })),
        ],
      }
    },
    name: 'vieval:speech-providers',
  }
}

/**
 * Contributes speech and transcription models to the shared `config.models` registry.
 * Each model takes the parameters of its provider, and its own parameters win.
 */
export function SpeechModels(options: SpeechModelsPluginOptions): SpeechPlugin {
  return {
    configVieval(config) {
      const providers = new Map((config.speechProviders ?? []).map(provider => [provider.id, provider]))
      const models = options.models.map((model) => {
        const provider = providers.get(model.provider)
        if (provider == null)
          throw new Error(`Unknown speech provider "${model.provider}" referenced by model "${model.id}".`)
        const inferenceExecutor = provider.inferenceExecutor
        return {
          ...model,
          inferenceExecutor,
          inferenceExecutorId: typeof inferenceExecutor === 'string' ? inferenceExecutor : inferenceExecutor.id,
          parameters: { ...provider.parameters, ...model.parameters },
        }
      })

      return {
        ...config,
        models: [...(config.models ?? []), ...models],
      }
    },
    name: 'vieval:speech-models',
  }
}

/**
 * Resolves a configured speech or transcription model from one scoped matrix axis.
 *
 * Expects:
 * - `options.axis` to exist in `context.task.matrix[scope]`
 * - the selected model to have the expected capability
 */
export function speechModelFromMatrix(
  context: MatrixModelContext,
  scope: MatrixModelScope,
  capability: SpeechModelCapability,
  options: SpeechModelFromMatrixOptions,
): ModelDefinition {
  const selected = context.task.matrix[scope][options.axis]
  if (selected == null)
    throw new Error(`Missing ${scope} matrix axis "${options.axis}".`)

  const model = resolveModelByName(context.models, String(selected))
  if (model == null)
    throw new Error(`Unknown configured speech model "${String(selected)}" from ${scope} matrix axis "${options.axis}".`)
  if (model.parameters?.capability !== capability)
    throw new Error(`Model "${model.id}" from ${scope} matrix axis "${options.axis}" is not a ${capability} model.`)

  return model
}

/** Resolves a TTS model from one run-matrix axis, for example when the TTS provider is part of the system under test. */
export function speechModelFromRun(context: MatrixModelContext, options: SpeechModelFromMatrixOptions): ModelDefinition {
  return speechModelFromMatrix(context, 'run', 'speech', options)
}

/** Resolves a TTS model from one eval-matrix axis, for example when TTS only renders text for an evaluator. */
export function speechModelFromEval(context: MatrixModelContext, options: SpeechModelFromMatrixOptions): ModelDefinition {
  return speechModelFromMatrix(context, 'eval', 'speech', options)
}

/** Resolves an ASR model from one run-matrix axis, for example when speech recognition is under test. */
export function transcriptionModelFromRun(context: MatrixModelContext, options: SpeechModelFromMatrixOptions): ModelDefinition {
  return speechModelFromMatrix(context, 'run', 'transcription', options)
}

/** Resolves an ASR model from one eval-matrix axis, for example when speech recognition is part of the evaluator. */
export function transcriptionModelFromEval(context: MatrixModelContext, options: SpeechModelFromMatrixOptions): ModelDefinition {
  return speechModelFromMatrix(context, 'eval', 'transcription', options)
}

function createModelDefinition(options: SpeechModelFromBaseOptions, parameters: Record<string, unknown>): SpeechModelDefinition {
  return {
    aliases: options.aliases ?? [],
    id: options.id ?? `openai:${options.model}`,
    inferenceExecutor: 'openai',
    inferenceExecutorId: 'openai',
    model: options.model,
    parameters: { ...options.parameters, ...parameters },
    provider: options.provider,
  }
}

function resolveProviderParameters(provider: SpeechProviderDefinition, env: NodeJS.ProcessEnv): Record<string, unknown> {
  const parameters: Record<string, unknown> = { ...provider.parameters }
  for (const [name, key] of Object.entries(provider.optionalEnv ?? {})) {
    const value = envFrom(env, { name: key, type: 'string' })
    if (value != null)
      parameters[name] = value
  }
  for (const [name, key] of Object.entries(provider.requiredEnv ?? {}))
    parameters[name] = requiredEnvFrom(env, { name: key, type: 'string' })
  return parameters
}

/**
 * Runtime config of one OpenAI-compatible TTS model, ready for a `POST /audio/speech` request.
 */
export interface OpenAISpeechModelRuntimeConfig {
  /**
   * API key. A local server, for example unspeech without auth, needs none.
   *
   * @default ''
   */
  apiKey: string
  baseURL: string
  inferenceExecutor: 'openai'
  model: string
  /** True when the endpoint takes the language of the text in `extra_body.language`. */
  sendsLanguage: boolean
  /** The voice for any language that `voices` does not name. */
  voice?: string
  /** The voice of each language. */
  voices: Readonly<Record<string, string>>
}

/**
 * Runtime config of one OpenAI-compatible ASR model, ready for a `POST /audio/transcriptions` request.
 */
export interface OpenAITranscriptionModelRuntimeConfig {
  /**
   * API key. A local server, for example whisper.cpp, needs none.
   *
   * @default ''
   */
  apiKey: string
  baseURL: string
  inferenceExecutor: 'openai'
  model: string
}

/**
 * Resolves the runtime config of a TTS model that a speech-model helper resolved.
 *
 * Expects:
 * - `model` to be a `speech` model with a `baseURL` parameter
 */
export function openaiSpeechFromRunContext(model: ModelDefinition): OpenAISpeechModelRuntimeConfig {
  const parameters = parametersOf(model, 'speech')
  return {
    apiKey: optionalString(parameters, 'apiKey', model) ?? '',
    baseURL: requiredString(parameters, 'baseURL', model),
    inferenceExecutor: 'openai',
    model: model.model,
    sendsLanguage: parameters.sendsLanguage === true,
    voice: optionalString(parameters, 'voice', model),
    voices: stringRecord(parameters.voices, model),
  }
}

/**
 * Resolves the runtime config of an ASR model that a speech-model helper resolved.
 *
 * Expects:
 * - `model` to be a `transcription` model with a `baseURL` parameter
 */
export function openaiTranscriptionFromRunContext(model: ModelDefinition): OpenAITranscriptionModelRuntimeConfig {
  const parameters = parametersOf(model, 'transcription')
  return {
    apiKey: optionalString(parameters, 'apiKey', model) ?? '',
    baseURL: requiredString(parameters, 'baseURL', model),
    inferenceExecutor: 'openai',
    model: model.model,
  }
}

/**
 * Resolves the xsai request options of one transcription call, for an OpenAI-compatible model or a {@link TranscriptionExecutor}.
 *
 * Expects:
 * - `model` to be a `transcription` model
 * - `language` to be the language of the call. An executor can select its recognizer from it.
 */
export function transcriptionRequestFromRunContext(model: ModelDefinition, options: { language?: string } = {}): TranscriptionRequestOptions {
  if (model.parameters?.capability !== 'transcription')
    throw new Error(`Model "${model.id}" is not a transcription model.`)
  if (isTranscriptionExecutor(model.inferenceExecutor))
    return model.inferenceExecutor.transcription({ language: options.language, model: model.model, parameters: model.parameters ?? {} })
  return openaiTranscriptionFromRunContext(model)
}

function isTranscriptionExecutor(value: unknown): value is TranscriptionExecutor {
  return typeof value === 'object' && value != null && 'transcription' in value && typeof value.transcription === 'function'
}

/**
 * Selects the voice of one language: the language voice, or the default voice.
 * Returns `undefined` when the model has no voice for the language.
 */
export function voiceFor(config: Pick<OpenAISpeechModelRuntimeConfig, 'voice' | 'voices'>, language: string): string | undefined {
  return config.voices[language] ?? config.voice
}

function parametersOf(model: ModelDefinition, capability: string): Record<string, unknown> {
  const parameters = model.parameters ?? {}
  if (model.inferenceExecutorId !== 'openai')
    throw new Error(`Expected an openai model, got "${model.inferenceExecutorId}" for "${model.id}".`)
  if (parameters.capability !== capability)
    throw new Error(`Model "${model.id}" is not a ${capability} model.`)
  return parameters
}

function optionalString(parameters: Record<string, unknown>, name: string, model: ModelDefinition): string | undefined {
  const value = parameters[name]
  if (value == null || value === '')
    return undefined
  if (typeof value !== 'string')
    throw new Error(`Parameter "${name}" of model "${model.id}" must be a string.`)
  return value
}

function requiredString(parameters: Record<string, unknown>, name: string, model: ModelDefinition): string {
  const value = optionalString(parameters, name, model)
  if (value != null)
    return value

  // Providers resolve env lazily, so an unused model needs no env. A selected model reports what is missing here.
  const provider = 'provider' in model && typeof model.provider === 'string' ? ` Set it on speech provider "${model.provider}", for example through its env.` : ''
  throw new Error(`Model "${model.id}" has no "${name}" parameter.${provider}`)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value != null && Object.values(value).every(item => typeof item === 'string')
}

function stringRecord(value: unknown, model: ModelDefinition): Record<string, string> {
  if (value == null)
    return {}
  if (!isStringRecord(value))
    throw new Error(`Parameter "voices" of model "${model.id}" must map languages to voice names.`)
  return value
}
