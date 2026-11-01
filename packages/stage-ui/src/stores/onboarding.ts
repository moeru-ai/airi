import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { number, object, picklist, record, safeParse, string } from 'valibot'
import { computed, ref, shallowRef, watch } from 'vue'

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
  /** Steps that a request adds before this step, because this step reads their result. */
  requires?: readonly string[]
}

/** A step that a host adds. The host also passes the step with its component to the flow as `extraSteps`. */
export interface HostOnboardingStep {
  id: string
  /** @default 1 */
  version?: number
  /**
   * The default keeps the step inside first-run provider setup, as host steps were before requests.
   *
   * @default 'provider-setup'
   */
  scope?: OnboardingStepScope
  requires?: readonly string[]
}

/** One requested flow. The leader keeps the queue, so a request from any window opens one flow at a time. */
export interface OnboardingRequest {
  id: string
  /** The steps to show, in flow order. `request` already added the required steps. */
  stepIds: string[]
  /** The caller, for example `startup` or `wake-word-toggle`. */
  source: string
}

export interface OnboardingRequestOptions {
  /**
   * The steps to show. Without a value, the request shows every pending step that applies, as startup does.
   */
  steps?: readonly string[]
  source: string
  /**
   * Shows the steps even when this device has a record of their current version, for example from settings.
   *
   * @default false
   */
  force?: boolean
}

/**
 * The outcome of each requested step after the flow closes:
 * - `done` or `later`: the record of the step's current version.
 * - `pending`: no record of the current version, for example when the user closed the flow.
 */
export type OnboardingRequestResult = Record<string, OnboardingStepOutcome | 'pending'>

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
  // The first request is the open flow. It is runtime state, so it is not persisted.
  const requests = ref<OnboardingRequest[]>([])

  async function openRequest(request: OnboardingRequest) {
    requests.value = [...requests.value, request]
  }

  /** Ends a request when its flow finishes or closes. A second call for the same request changes nothing. */
  async function settleRequest(requestId: string) {
    requests.value = requests.value.filter(request => request.id !== requestId)
  }

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
    // Sign-in replaces the open flow. A queued request opens next.
    requests.value = requests.value.slice(1)
    closeRequestId.value += 1
  }

  async function resetSetupState() {
    stepRecords.value = {}
    localStorage.removeItem(stepRecordsKey)
  }

  return {
    closeAfterAuthentication,
    closeRequestId,
    openRequest,
    recordSteps,
    requests,
    resetSetupState,
    settleRequest,
    stepRecords,
  }
}, {
  synced: {
    actions: [
      'closeAfterAuthentication',
      'openRequest',
      'recordSteps',
      'resetSetupState',
      'settleRequest',
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
  /** The open flow, or null. Every window sees the same request, because the leader owns the queue. */
  const activeRequest = computed(() => onboardingStateStore.requests[0] ?? null)
  /**
   * Host steps that this window registered. Each window that requests or renders onboarding registers
   * the same host steps. This is renderer state, so it does not cross windows.
   */
  const hostSteps = shallowRef<readonly SharedOnboardingStep[]>([])

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

  /** Shared steps first, in flow order, then the host steps in registration order. */
  const allSteps = computed(() => [...sharedOnboardingSteps, ...hostSteps.value])

  /** True when the step concerns the user now. It does not read the records. See `OnboardingStepScope`. */
  function isApplicable(step: SharedOnboardingStep) {
    return step.scope === 'device' || needsProviderSetup.value
  }

  /**
   * Adds the steps that the chosen steps need, and returns all of them in flow order.
   *
   * - A step adds each step in its `requires` list, and their requirements.
   * - The shared provider steps share state in memory. Configuration needs the selected provider, and
   *   model selection needs its models. So one of them adds all of them. A host step in the
   *   `provider-setup` scope does not add them.
   */
  function withRequiredSteps(stepIds: ReadonlySet<string>) {
    const chosen = new Set<string>()
    const visit = (id: string) => {
      const step = allSteps.value.find(candidate => candidate.id === id)
      if (!step || chosen.has(id))
        return
      chosen.add(id)
      step.requires?.forEach(visit)
    }
    stepIds.forEach(visit)

    const providerSteps = sharedOnboardingSteps.filter(step => step.scope === 'provider-setup')
    const providerStepChosen = providerSteps.some(step => chosen.has(step.id))
    return allSteps.value.filter(step => chosen.has(step.id) || (providerStepChosen && providerSteps.includes(step)))
  }

  /** The steps that startup shows, in flow order. */
  const pendingSteps = computed(() => withRequiredSteps(new Set(allSteps.value
    .filter(step => isApplicable(step) && isStepPending(stepRecords.value, step))
    .map(step => step.id))))

  // Check if first-time setup should be shown
  const skipOnboardingPath = ['/auth/callback']
  const needsOnboarding = computed(() =>
    pendingSteps.value.length > 0
    && !skipOnboardingPath.includes(document.location.pathname),
  )

  /**
   * Replaces the host steps of this window. Call it at startup, before the startup request.
   * The flow shows host steps in this order, so register a required step before the step that needs it.
   */
  function registerHostSteps(steps: readonly HostOnboardingStep[]) {
    hostSteps.value = steps.map(step => ({
      id: step.id,
      version: step.version ?? 1,
      scope: step.scope ?? 'provider-setup',
      requires: step.requires,
    }))
  }

  /** The outcome of each step, read from the records. A record of an older version counts as `pending`. */
  function resultOf(stepIds: readonly string[]): OnboardingRequestResult {
    return Object.fromEntries(stepIds.map((id) => {
      const step = allSteps.value.find(candidate => candidate.id === id)
      const stepRecord = stepRecords.value[id]
      return [id, step && stepRecord && !isStepPending(stepRecords.value, step) ? stepRecord.outcome : 'pending']
    }))
  }

  /**
   * Opens an onboarding flow and resolves when it closes.
   *
   * Only startup and user actions, for example a click or a switch, call it. A request without
   * steps to show resolves at once. Otherwise it waits in the leader queue behind the open flow.
   * The promise lives in the calling window, so it resolves only there.
   */
  async function request(options: OnboardingRequestOptions): Promise<OnboardingRequestResult> {
    const candidates = options.steps
      ? allSteps.value.filter(step => options.steps!.includes(step.id))
      : allSteps.value.filter(isApplicable)
    const chosen = options.force
      ? candidates
      : candidates.filter(step => isStepPending(stepRecords.value, step))
    const stepIds = withRequiredSteps(new Set(chosen.map(step => step.id))).map(step => step.id)
    if (stepIds.length === 0)
      return {}

    const id = crypto.randomUUID()
    const settled = new Promise<void>((resolve) => {
      const stop = watch(() => onboardingStateStore.requests.some(queued => queued.id === id), (queued) => {
        if (queued)
          return
        stop()
        resolve()
      })
    })
    await onboardingStateStore.openRequest({ id, stepIds, source: options.source })
    await settled
    return resultOf(stepIds)
  }

  /** Ends the open flow without records, for example when the user closes the dialog or starts sign-in. */
  async function dismissActiveRequest() {
    if (activeRequest.value)
      await onboardingStateStore.settleRequest(activeRequest.value.id)
  }

  function settleRequest(requestId: string) {
    return onboardingStateStore.settleRequest(requestId)
  }

  function recordSteps(steps: readonly OnboardingStepVersion[], outcome: OnboardingStepOutcome) {
    return onboardingStateStore.recordSteps(steps, outcome)
  }

  function closeAfterAuthentication() {
    return onboardingStateStore.closeAfterAuthentication()
  }

  function resetSetupState() {
    return onboardingStateStore.resetSetupState()
  }

  return {
    activeRequest,
    closeRequestId,
    stepRecords,
    pendingSteps,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    registerHostSteps,
    request,
    dismissActiveRequest,
    settleRequest,
    recordSteps,
    closeAfterAuthentication,
    resetSetupState,
  }
})
