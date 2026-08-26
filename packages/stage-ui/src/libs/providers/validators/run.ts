import type { ComposerTranslation } from 'vue-i18n'

import type {
  ProviderConfigValidator,
  ProviderDefinition,
  ProviderExtraMethods,
  ProviderInstance,
  ProviderRuntimeValidator,
} from '../types'

import { errorMessageFrom, merge } from '@moeru/std'

export interface ProviderValidationCallbacks {
  onValidatorError?: (info: { error: unknown, index: number, kind: ProviderValidationStepKind, step: ProviderValidationStep }) => void
  onValidatorStart?: (info: { index: number, kind: ProviderValidationStepKind, step: ProviderValidationStep }) => void
  onValidatorSuccess?: (info: { index: number, kind: ProviderValidationStepKind, result: { reason: string, valid: boolean }, step: ProviderValidationStep }) => void
}
export interface ProviderValidationPlan {
  config: Record<string, unknown>
  configValidators: ProviderConfigValidator<Record<string, unknown>>[]
  definition: ProviderDefinition
  providerExtra: ProviderExtraMethods<Record<string, unknown>> | undefined
  providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[]
  shouldValidate: boolean
  steps: ProviderValidationStep[]
}
export interface ProviderValidationStep {
  id: string
  kind: ProviderValidationStepKind
  label: string
  reason: string
  status: ProviderValidationStepStatus
}

export type ProviderValidationStepKind = 'config' | 'provider'

export type ProviderValidationStepStatus = 'idle' | 'invalid' | 'valid' | 'validating'

export function createConfigValidationSteps(configValidators: ProviderConfigValidator<Record<string, unknown>>[]): ProviderValidationStep[] {
  return configValidators.map(validator => ({
    id: validator.id,
    kind: 'config' as ProviderValidationStepKind,
    label: validator.name,
    reason: '',
    status: 'idle' as ProviderValidationStepStatus,
  }))
}

export function createProviderValidationSteps(providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[]): ProviderValidationStep[] {
  return providerValidators.map(validator => ({
    id: validator.id,
    kind: 'provider' as ProviderValidationStepKind,
    label: validator.name,
    reason: '',
    status: 'idle' as ProviderValidationStepStatus,
  }))
}

export async function getProviderValidationIntervalMs(options: {
  contextOptions: { t: ComposerTranslation }
  defaultIntervalMs?: number
  definition: ProviderDefinition
}) {
  const validators = await Promise.all((options.definition.validators?.validateProvider || []).map(creator => creator(options.contextOptions)))
  const defaultIntervalMs = options.defaultIntervalMs ?? 15_000
  const intervals = validators
    .filter(validator => validator.schedule?.mode === 'interval')
    .map(validator => validator.schedule?.intervalMs || defaultIntervalMs)

  if (intervals.length === 0) {
    return undefined
  }

  return Math.min(...intervals)
}

export async function getValidatorsOfProvider(options: {
  config: Record<string, unknown>
  contextOptions: { t: ComposerTranslation }
  definition: ProviderDefinition
  schemaDefaults: Record<string, unknown>
}): Promise<ProviderValidationPlan> {
  const { definition } = options

  const configValidators = await Promise.all((definition.validators?.validateConfig || []).map(creator => creator(options.contextOptions)))
  const allProviderValidators = await Promise.all((definition.validators?.validateProvider || []).map(creator => creator(options.contextOptions)))

  const providerValidators = allProviderValidators

  const steps: ProviderValidationStep[] = [
    ...createConfigValidationSteps(configValidators),
    ...createProviderValidationSteps(providerValidators),
  ]

  const normalizedConfig = merge(options.schemaDefaults, options.config)
  const validationRequired = definition.validationRequiredWhen || (<TConfig extends Record<string, any>>(_: TConfig) => false)
  const shouldValidate = await validationRequired(normalizedConfig)

  return {
    config: normalizedConfig,
    configValidators: configValidators as ProviderValidationPlan['configValidators'],
    definition,
    providerExtra: definition.extraMethods as ProviderValidationPlan['providerExtra'],
    providerValidators: providerValidators as ProviderValidationPlan['providerValidators'],
    shouldValidate,
    steps,
  }
}

export async function validateProvider(
  plan: ProviderValidationPlan,
  contextOptions: { t: ComposerTranslation },
  callbacks: ProviderValidationCallbacks = {},
) {
  const { config, configValidators, definition, providerExtra, providerValidators, steps } = plan
  const runContext = {
    ...contextOptions,
    validationCache: new Map<string, unknown>(),
  }
  const { onValidatorError, onValidatorStart, onValidatorSuccess } = callbacks

  const configResults = await Promise.all(configValidators.map(async (validatorDefinition, index) => {
    const step = steps[index]
    step.status = 'validating'
    step.reason = ''
    onValidatorStart?.({ index, kind: 'config', step })
    try {
      const result = await validatorDefinition.validator(config, runContext)
      step.status = result.valid ? 'valid' : 'invalid'
      step.reason = result.valid ? '' : result.reason
      onValidatorSuccess?.({ index, kind: 'config', result, step })
      return result
    }
    catch (error) {
      step.status = 'invalid'
      step.reason = errorMessageFrom(error) ?? 'Unknown error'
      onValidatorError?.({ error, index, kind: 'config', step })
      return { reason: step.reason, valid: false }
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

  try {
    await Promise.all(providerValidators.map(async (validatorDefinition, index) => {
      const step = steps[providerStepOffset + index]
      step.status = 'validating'
      step.reason = ''
      onValidatorStart?.({ index, kind: 'provider', step })
      try {
        const result = await validatorDefinition.validator(config, providerInstance, providerExtra as any, runContext)
        step.status = result.valid ? 'valid' : 'invalid'
        step.reason = result.valid ? '' : result.reason
        onValidatorSuccess?.({ index, kind: 'provider', result, step })
      }
      catch (error) {
        step.status = 'invalid'
        step.reason = errorMessageFrom(error) ?? 'Unknown error'
        onValidatorError?.({ error, index, kind: 'provider', step })
      }
    }))
  }
  finally {
    await (providerInstance as ProviderInstance & { dispose?: () => Promise<void> | void }).dispose?.()
  }

  return steps
}
