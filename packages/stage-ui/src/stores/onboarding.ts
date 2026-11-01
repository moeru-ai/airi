import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { number, object, picklist, record, safeParse, string } from 'valibot'
import { computed, ref, watch } from 'vue'

import { useAuthStore } from './auth'
import { useProviderConfigStore } from './providers/config'

const essentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible', 'official-provider'] as const
const credentialBasedEssentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'deepseek'] as const

/** A step and the version of it that the user saw. A higher version shows the step again. */
export interface OnboardingStepVersion {
  id: string
  version: number
}

/**
 * - `done`: the user finished the step.
 * - `later`: the user postponed an optional step. It shows again when its version increases.
 */
export type OnboardingStepOutcome = 'done' | 'later'

export interface OnboardingStepRecord {
  version: number
  outcome: OnboardingStepOutcome
  /** Milliseconds since the epoch. */
  at: number
}

/**
 * When a shared step applies:
 * - `provider-setup`: only while the device needs a chat provider. A signed-in user or a provider configured at startup skips it.
 * - `device`: on every device, for example a permission. Signing in does not skip it.
 */
export type OnboardingStepScope = 'provider-setup' | 'device'

export interface SharedOnboardingStep extends OnboardingStepVersion {
  scope: OnboardingStepScope
}

/**
 * The steps that can open onboarding at startup. A step opens it when the step applies and
 * this device has no record of its current version. Host steps from `extraSteps` show only
 * inside a flow that a shared step opened, because the host renders them in another window on desktop.
 */
export const sharedOnboardingSteps: readonly SharedOnboardingStep[] = Object.freeze([
  { id: 'welcome', version: 1, scope: 'provider-setup' },
  { id: 'provider-selection', version: 1, scope: 'provider-setup' },
  { id: 'provider-configuration', version: 1, scope: 'provider-setup' },
  { id: 'model-selection', version: 1, scope: 'provider-setup' },
])

const stepRecordsKey = 'onboarding/steps'
const stepRecordsSchema = record(string(), object({
  version: number(),
  outcome: picklist(['done', 'later']),
  at: number(),
}))

/** True when the records have no entry for the step's current version. It does not check whether the step applies. */
export function isStepPending(records: Record<string, OnboardingStepRecord>, step: OnboardingStepVersion) {
  const stepRecord = records[step.id]
  return !stepRecord || stepRecord.version < step.version
}

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function readStepRecords(): Record<string, OnboardingStepRecord> {
  // NOTICE:
  // Older versions stored only `onboarding/completed` and `onboarding/skipped`.
  // Give each step of that time a record at version 1, so an upgrade does not reopen onboarding.
  // Seeds in testing-audio and scenarios-stage-tamagotchi-electron still write the old keys.
  // Removal condition: two stable releases after step records ship, and after the seeds move.
  const legacyCompleted = localStorage.getItem('onboarding/completed') === 'true'
  const legacySkipped = localStorage.getItem('onboarding/skipped') === 'true'
  if (legacyCompleted || legacySkipped) {
    const at = Date.now()
    const outcome: OnboardingStepOutcome = legacyCompleted ? 'done' : 'later'
    // `analytics-notice` and `step-permissions` are host steps that existed at the same time.
    const legacyStepIds = [...sharedOnboardingSteps.map(step => step.id), 'analytics-notice', 'step-permissions']
    const migrated = Object.fromEntries(legacyStepIds.map(id => [id, { version: 1, outcome, at }]))
    localStorage.setItem(stepRecordsKey, JSON.stringify({ ...migrated, ...parseStepRecords() }))
    localStorage.removeItem('onboarding/completed')
    localStorage.removeItem('onboarding/skipped')
  }

  return parseStepRecords()
}

/** A missing or unreadable value has no records, so every applicable step shows. */
function parseStepRecords(): Record<string, OnboardingStepRecord> {
  try {
    const parsed = safeParse(stepRecordsSchema, JSON.parse(localStorage.getItem(stepRecordsKey) ?? '{}'))
    return parsed.success ? parsed.output : {}
  }
  catch {
    return {}
  }
}

const useOnboardingStateStore = defineStore('onboarding-state', () => {
  // Pinia owns live cross-window state. Persistence is command-driven so
  // storage events cannot become a second state propagation channel.
  const stepRecords = ref<Record<string, OnboardingStepRecord>>(readStepRecords())
  // This counter is a transient cross-window command. The Electron onboarding
  // renderer owns the actual BrowserWindow close side effect.
  const closeRequestId = ref(0)

  async function recordSteps(steps: readonly OnboardingStepVersion[], outcome: OnboardingStepOutcome) {
    const at = Date.now()
    stepRecords.value = {
      ...stepRecords.value,
      ...Object.fromEntries(steps.map(step => [step.id, { version: step.version, outcome, at }])),
    }
    localStorage.setItem(stepRecordsKey, JSON.stringify(stepRecords.value))
  }

  /** Sign-in replaces provider setup, so its steps count as done. A later sign-out does not open them again. */
  async function closeAfterAuthentication() {
    await recordSteps(sharedOnboardingSteps.filter(step => step.scope === 'provider-setup'), 'done')
    closeRequestId.value += 1
  }

  async function resetSetupState() {
    stepRecords.value = {}
    localStorage.removeItem(stepRecordsKey)
  }

  return {
    closeAfterAuthentication,
    closeRequestId,
    recordSteps,
    resetSetupState,
    stepRecords,
  }
}, {
  synced: {
    actions: [
      'closeAfterAuthentication',
      'recordSteps',
      'resetSetupState',
    ],
    state: true,
  },
})

export const useOnboardingStore = defineStore('onboarding', () => {
  const providerStore = useProviderConfigStore()
  const authStore = useAuthStore()
  const onboardingStateStore = useOnboardingStateStore()
  const closeRequestId = computed(() => onboardingStateStore.closeRequestId)
  const stepRecords = computed(() => onboardingStateStore.stepRecords)

  // This is renderer-local view state and never crosses the Pinia channel.
  const showingSetup = ref(false)

  // Check if any essential provider is configured
  const hasEssentialProviderConfigured = computed(() => {
    return essentialProviderIds.some(providerId => providerStore.configuredProviders[providerId])
  })

  // Persisted provider status ('configured') is restored synchronously from
  // localStorage by useProviderConfigStore, so this snapshot is available at
  // store creation. It is intentionally NOT reactive: providers configured
  // during the onboarding flow itself must not close the dialog mid-flow.
  const hadEssentialProviderConfiguredAtStartup = hasEssentialProviderConfigured.value

  // Fallback for app startup timing:
  // If configured state has not been revalidated yet, infer "configured"
  // from persisted essential credentials.
  const hasEssentialProviderCredentialConfigured = computed(() => {
    return credentialBasedEssentialProviderIds.some((providerId) => {
      const providerConfig = providerStore.getProviderConfig(providerId)
      if (!providerConfig) {
        return false
      }

      return hasNonEmptyText(providerConfig.apiKey)
    })
  })

  const needsProviderSetup = computed(() =>
    !authStore.isAuthenticated
    && !authStore.token
    && !hadEssentialProviderConfiguredAtStartup,
  )

  function appliesToDevice(step: SharedOnboardingStep) {
    return step.scope === 'device' || needsProviderSetup.value
  }

  /** The shared steps that the flow shows, in flow order. */
  const pendingSharedSteps = computed(() => {
    const applicableSteps = sharedOnboardingSteps.filter(appliesToDevice)
    // The provider steps share state in memory. Configuration needs the selected provider, and
    // model selection needs its models. So a new version of one of them shows the whole group.
    const providerSetupPending = applicableSteps.some(step => step.scope === 'provider-setup' && isStepPending(stepRecords.value, step))
    return applicableSteps.filter(step => isStepPending(stepRecords.value, step) || (providerSetupPending && step.scope === 'provider-setup'))
  })

  // Check if first-time setup should be shown
  const skipOnboardingPath = ['/auth/callback']
  const needsOnboarding = computed(() =>
    pendingSharedSteps.value.length > 0
    && !skipOnboardingPath.includes(document.location.pathname),
  )

  // Keep in-memory display flag aligned with persisted onboarding status
  // when setup is completed from another window (desktop multi-window case).
  watch(needsOnboarding, (needSetup) => {
    if (!needSetup) {
      showingSetup.value = false
    }
  })

  function recordSteps(steps: readonly OnboardingStepVersion[], outcome: OnboardingStepOutcome) {
    return onboardingStateStore.recordSteps(steps, outcome)
  }

  function closeAfterAuthentication() {
    showingSetup.value = false
    return onboardingStateStore.closeAfterAuthentication()
  }

  function resetSetupState() {
    showingSetup.value = false
    return onboardingStateStore.resetSetupState()
  }

  // Force show setup dialog
  function forceShowSetup() {
    showingSetup.value = true
  }

  return {
    showingSetup,
    closeRequestId,
    stepRecords,
    pendingSharedSteps,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    recordSteps,
    closeAfterAuthentication,
    resetSetupState,
    forceShowSetup,
  }
})
