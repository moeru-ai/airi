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

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  // The webview-ui already ships with 27+ providers and builds its own
  // settings UI. We only need to seed an empty config — the user fills in
  // their API key through the Settings tab.
  apiProvider: 'openrouter',
  apiKey: '',
  apiModelId: '',
  temperature: 0,
  maxTokens: 4096,
} as unknown as ProviderSettings

function initialState(): ExtensionState {
  return {
    version: '0.1.0',
    clineMessages: [],
    apiConfiguration: DEFAULT_PROVIDER_SETTINGS,
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
    renderContext: 'sidebar',
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let state: ExtensionState = initialState()

/** Full state hydration — sent to the webview on load. */
export function getState(): ExtensionState {
  return state
}

/** Replace the entire state (used by import/reset). */
export function setState(newState: ExtensionState): ExtensionState {
  state = newState
  return state
}

/** Merge a partial update into the state (used by settings changes). */
export function patchState(patch: Partial<ExtensionState>): ExtensionState {
  state = { ...state, ...patch }
  return state
}

// ---------------------------------------------------------------------------
// Task / history helpers
// ---------------------------------------------------------------------------

import type { HistoryItem } from '@roo-code/types'

const tasks = new Map<string, HistoryItem>()

export function listTasks(): HistoryItem[] {
  return Array.from(tasks.values()).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
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
