import type { ComposerTranslation } from 'vue-i18n'

import type {
  ProviderConfigValidator,
  ProviderDefinition,
  ProviderExtraMethods,
  ProviderInstance,
  ProviderRuntimeValidator,
} from '../types'

import { errorMessageFrom, merge } from '@moeru/std'

export type ProviderValidationStepStatus = 'idle' | 'validating' | 'valid' | 'invalid'
export type ProviderValidationStepKind = 'config' | 'provider'
export interface ProviderValidationStep {
  id: string
  label: string
  status: ProviderValidationStepStatus
  reason: string
  kind: ProviderValidationStepKind
}

export interface ProviderValidationPlan {
  steps: ProviderValidationStep[]
  config: Record<string, unknown>
  definition: ProviderDefinition
  configValidators: ProviderConfigValidator<Record<string, unknown>>[]
  providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[]
  providerExtra: ProviderExtraMethods<Record<string, unknown>> | undefined
  shouldValidate: boolean
}

export interface ProviderValidationCallbacks {
  onValidatorStart?: (info: { kind: ProviderValidationStepKind, index: number, step: ProviderValidationStep }) => void
  onValidatorSuccess?: (info: { kind: ProviderValidationStepKind, index: number, step: ProviderValidationStep, result: { reason: string, valid: boolean } }) => void
  onValidatorError?: (info: { kind: ProviderValidationStepKind, index: number, step: ProviderValidationStep, error: unknown }) => void
}

export function createConfigValidationSteps(configValidators: ProviderConfigValidator<Record<string, unknown>>[]): ProviderValidationStep[] {
  return configValidators.map(validator => ({
    id: validator.id,
    label: validator.name,
    status: 'idle' as ProviderValidationStepStatus,
    reason: '',
    kind: 'config' as ProviderValidationStepKind,
  }))
}

export function createProviderValidationSteps(providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[]): ProviderValidationStep[] {
  return providerValidators.map(validator => ({
    id: validator.id,
    label: validator.name,
    status: 'idle' as ProviderValidationStepStatus,
    reason: '',
    kind: 'provider' as ProviderValidationStepKind,
  }))
}

export function getProviderValidationIntervalMs(options: {
  definition: ProviderDefinition
  contextOptions: { t: ComposerTranslation }
  defaultIntervalMs?: number
}) {
  const validators = (options.definition.validators?.validateProvider || []).map(creator => creator(options.contextOptions))
  const defaultIntervalMs = options.defaultIntervalMs ?? 15_000
  const intervals = validators
    .filter(validator => validator.schedule?.mode === 'interval')
    .map(validator => validator.schedule?.intervalMs || defaultIntervalMs)

  if (intervals.length === 0) {
    return undefined
  }

  return Math.min(...intervals)
}

export function getValidatorsOfProvider(options: {
  definition: ProviderDefinition
  config: Record<string, unknown>
  schemaDefaults: Record<string, unknown>
  contextOptions: { t: ComposerTranslation }
}): ProviderValidationPlan {
  const { definition } = options

  const configValidators = (definition.validators?.validateConfig || []).map(creator => creator(options.contextOptions))
  const allProviderValidators = (definition.validators?.validateProvider || []).map(creator => creator(options.contextOptions))

  const providerValidators = allProviderValidators

  const steps: ProviderValidationStep[] = [
    ...createConfigValidationSteps(configValidators),
    ...createProviderValidationSteps(providerValidators),
  ]

  const normalizedConfig = merge(options.schemaDefaults, options.config)
  const validationRequired = definition.validationRequiredWhen || (<TConfig extends Record<string, any>>(_: TConfig) => false)
  const shouldValidate = validationRequired(normalizedConfig)

  return {
    steps,
    config: normalizedConfig,
    definition,
    configValidators: configValidators as ProviderValidationPlan['configValidators'],
    providerValidators: providerValidators as ProviderValidationPlan['providerValidators'],
    providerExtra: definition.extraMethods as ProviderValidationPlan['providerExtra'],
    shouldValidate,
  }
}

export async function validateProvider(
  plan: ProviderValidationPlan,
  contextOptions: { t: ComposerTranslation },
  callbacks: ProviderValidationCallbacks = {},
) {
  const { configValidators, providerValidators, steps, config, definition, providerExtra } = plan
  const runContext = {
    ...contextOptions,
    validationCache: new Map<string, unknown>(),
  }
  const { onValidatorError, onValidatorStart, onValidatorSuccess } = callbacks

  const configResults = await Promise.all(configValidators.map(async (validatorDefinition, index) => {
    const step = steps[index]
    step.status = 'validating'
    step.reason = ''
    onValidatorStart?.({ kind: 'config', index, step })
    try {
      const result = await validatorDefinition.validator(config, runContext)
      step.status = result.valid ? 'valid' : 'invalid'
      step.reason = result.valid ? '' : result.reason
      onValidatorSuccess?.({ kind: 'config', index, step, result })
      return result
    }
    catch (error) {
      step.status = 'invalid'
      step.reason = errorMessageFrom(error) ?? 'Unknown error'
      onValidatorError?.({ kind: 'config', index, step, error })
      return { valid: false, reason: step.reason }
    }
  }))

  const configIsValid = configResults.every(result => result.valid)

  const providerStepOffset = configValidators.length
  if (!configIsValid) {
    for (let i = 0; i < providerValidators.length; i++) {
      const step = steps[providerStepOffset + i]
      step.status = 'invalid'
      step.reason = 'Fix configuration checks first.'
    }
    return steps
  }

  let providerInstance: ProviderInstance
  try {
    providerInstance = await definition.createProvider(config)
  }
  catch (error) {
    for (let i = 0; i < providerValidators.length; i++) {
      const step = steps[providerStepOffset + i]
      step.status = 'invalid'
      step.reason = errorMessageFrom(error) ?? 'Unknown error'
    }
    return steps
  }

  await Promise.all(providerValidators.map(async (validatorDefinition, index) => {
    const step = steps[providerStepOffset + index]
    step.status = 'validating'
    step.reason = ''
    onValidatorStart?.({ kind: 'provider', index, step })
    try {
      const result = await validatorDefinition.validator(config, providerInstance, providerExtra as any, runContext)
      step.status = result.valid ? 'valid' : 'invalid'
      step.reason = result.valid ? '' : result.reason
      onValidatorSuccess?.({ kind: 'provider', index, step, result })
    }
    catch (error) {
      step.status = 'invalid'
      step.reason = errorMessageFrom(error) ?? 'Unknown error'
      onValidatorError?.({ kind: 'provider', index, step, error })
    }
  }))

  return steps
}
