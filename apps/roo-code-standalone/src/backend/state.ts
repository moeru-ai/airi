/**
 * In-memory state store for the standalone backend.
 *
 * This replaces the VSCode Extension Host's role as the state owner.
 * The webview-ui reads/writes state through REST endpoints instead of
 * acquireVsCodeApi().postMessage().
 *
 * Future: swap for SQLite persistence (Phase 4).
 */

import type { ExtensionState, ProviderSettings } from '@roo-code/types'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PROVIDER_SETTINGS = {
  // The webview-ui already ships with 27+ providers and builds its own
  // settings UI. We only need to seed an empty config — the user fills in
  // their API key through the Settings tab.
  //
  // Note: `temperature` is NOT a ProviderSettings field — it's a per-model
  // parameter managed by the TemperatureControl UI component. `apiKey` and
  // `apiModelId` are provider-specific; `modelMaxTokens` is the base field.
  apiProvider: 'openrouter',
  modelMaxTokens: 4096,
} satisfies ProviderSettings

function buildInitialState(): ExtensionState {
  return {
    version: '0.1.0',
    clineMessages: [],
    apiConfiguration: { ...DEFAULT_PROVIDER_SETTINGS },
    shouldShowAnnouncement: false,
    taskHistory: [],
    writeDelayMs: 0,
    enableCheckpoints: false,
    checkpointTimeout: 15,
    maxOpenTabsContext: 20,
    maxWorkspaceFiles: 200,
    showRooIgnoredFiles: false,
    enableSubfolderRules: false,
    maxImageFileSize: 5,
    maxTotalImageSize: 20,
    experiments: {},
    mcpEnabled: true,
    mode: 'vibe',
    customModes: [],
    toolRequirements: {},
    renderContext: 'sidebar' as const,
    organizationAllowList: { allowAll: true, providers: {} },
    autoCondenseContext: false,
    autoCondenseContextPercent: 80,
    autoCondenseOnModelSwitch: false,
    autoCondenseModelSwitchLookback: 3,
    profileThresholds: {},
    hasOpenedModeSelector: false,
    currentApiConfigName: 'default',
    listApiConfigMeta: [],
    pinnedApiConfigs: {},
    customInstructions: '',
    dismissedUpsells: [],
    autoApprovalEnabled: false,
    alwaysAllowReadOnly: false,
    alwaysAllowReadOnlyOutsideWorkspace: false,
    alwaysAllowWrite: false,
    alwaysAllowWriteOutsideWorkspace: false,
    alwaysAllowWriteProtected: false,
    alwaysAllowMcp: true,
    alwaysAllowModeSwitch: true,
    modeSwitchingEnabled: true,
    alwaysAllowSubtasks: false,
    alwaysAllowFollowupQuestions: false,
    alwaysAllowExecute: false,
    allowedCommands: [],
    ttsEnabled: false,
    ttsSpeed: 1,
    soundEnabled: false,
    soundVolume: 0.5,
    cwd: process.cwd(),
  }
}

/**
 * Build a fresh initial state, preserving fields that should survive a reset.
 *
 * The webview-ui expects `apiConfiguration` (user's API keys) to persist across
 * resets — wiping it would force the user to re-enter credentials every time.
 */
export function createInitialStateFrom(current: ExtensionState): ExtensionState {
  return {
    ...buildInitialState(),
    apiConfiguration: current.apiConfiguration,
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let state: ExtensionState = buildInitialState()

/** Full state hydration — sent to the webview on load. */
export function getState(): ExtensionState {
  return state
}

/** Replace the entire state (used by import/reset). */
export function setState(newState: ExtensionState): ExtensionState {
  state = newState
  return state
}

/** Merge a partial update into the state (used by settings changes).
 *
 * Performs a 2-level merge for known nested objects so that callers can
 * patch a single field inside `apiConfiguration` (for example) without
 * wiping the rest of the object.
 */
export function patchState(patch: Record<string, unknown>): ExtensionState {
  const merged: Record<string, unknown> = { ...state }
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      merged[key] = { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) }
    } else {
      merged[key] = value
    }
  }
  state = merged as unknown as ExtensionState
  return state
}

// ---------------------------------------------------------------------------
// Task / history helpers
// ---------------------------------------------------------------------------

import type { HistoryItem } from '@roo-code/types'

export const tasks = new Map<string, HistoryItem>()

export function listTasks(): HistoryItem[] {
  return Array.from(tasks.values()).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
}

/** O(1) task count — avoids converting the entire map to a sorted array. */
export function getTaskCount(): number {
  return tasks.size
}

export function getTask(id: string): HistoryItem | undefined {
  return tasks.get(id)
}

export function upsertTask(item: HistoryItem): void {
  if (!item.id) return
  tasks.set(item.id, item)
}

export function deleteTask(id: string): void {
  tasks.delete(id)
}

export function clearTasks(): void {
  tasks.clear()
}
