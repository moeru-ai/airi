import type { RuntimeFactInvalidationTag } from '../server/runtime-facts'
import type { ActionKind, RiskLevel } from '../types'

export type OperationEffectType = 'observe' | 'read' | 'mutate' | 'launch' | 'network' | 'shell'
export type OperationTargetSurface = 'desktop' | 'browser' | 'terminal' | 'coding' | 'system'
export type OperationApprovalScope = 'none' | 'per_action' | 'terminal_and_apps' | 'pty_session'
export type OperationContractActionKind = ActionKind | 'pty_create'

export interface OperationContract {
  actionKind: OperationContractActionKind
  effectType: OperationEffectType
  targetSurface: OperationTargetSurface
  requiresFocus: boolean
  idempotent: boolean
  reversible: boolean
  postconditionRequired: boolean
  approvalScope: OperationApprovalScope
  baseRiskLevel: RiskLevel
  /** Declarative list of runtime fact invalidation tags this action may produce on success. */
  invalidationTags: readonly RuntimeFactInvalidationTag[]
}

type OperationContractBaseline = Omit<OperationContract, 'actionKind'>

const observeReadDesktopBaseline: OperationContractBaseline = {
  effectType: 'observe',
  targetSurface: 'desktop',
  requiresFocus: false,
  idempotent: true,
  reversible: false,
  postconditionRequired: false,
  approvalScope: 'none',
  baseRiskLevel: 'low',
  invalidationTags: ['screenshot_refresh'],
}

const codingReadBaseline: OperationContractBaseline = {
  effectType: 'read',
  targetSurface: 'coding',
  requiresFocus: false,
  idempotent: true,
  reversible: false,
  postconditionRequired: false,
  approvalScope: 'none',
  baseRiskLevel: 'low',
  invalidationTags: [],
}

const desktopMutateBaseline: OperationContractBaseline = {
  effectType: 'mutate',
  targetSurface: 'desktop',
  requiresFocus: true,
  idempotent: false,
  reversible: false,
  postconditionRequired: true,
  approvalScope: 'per_action',
  baseRiskLevel: 'medium',
  invalidationTags: ['desktop_mutation'],
}

const actionKindContractBaselines = {
  screenshot: observeReadDesktopBaseline,
  observe_windows: {
    ...observeReadDesktopBaseline,
    // observe_windows does not refresh the screenshot buffer
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },
  clipboard_read_text: {
    effectType: 'read' as const,
    targetSurface: 'system' as const,
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'none' as const,
    baseRiskLevel: 'low' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },
  secret_read_env_value: {
    effectType: 'read' as const,
    targetSurface: 'system' as const,
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action' as const,
    baseRiskLevel: 'medium' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },

  coding_review_workspace: codingReadBaseline,
  coding_read_file: codingReadBaseline,
  coding_compress_context: codingReadBaseline,
  coding_report_status: codingReadBaseline,
  coding_search_text: codingReadBaseline,
  coding_search_symbol: codingReadBaseline,
  coding_find_references: codingReadBaseline,
  coding_analyze_impact: codingReadBaseline,
  coding_validate_hypothesis: codingReadBaseline,
  coding_select_target: codingReadBaseline,
  coding_plan_changes: codingReadBaseline,
  coding_review_changes: codingReadBaseline,
  coding_diagnose_changes: codingReadBaseline,
  coding_capture_validation_baseline: codingReadBaseline,
  coding_list_files: codingReadBaseline,
  coding_agentic_run: {
    effectType: 'mutate' as const,
    targetSurface: 'coding' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action' as const,
    baseRiskLevel: 'high' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },

  click: desktopMutateBaseline,
  type_text: desktopMutateBaseline,
  press_keys: desktopMutateBaseline,
  scroll: desktopMutateBaseline,

  open_app: {
    effectType: 'launch' as const,
    targetSurface: 'desktop' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: true,
    approvalScope: 'terminal_and_apps' as const,
    baseRiskLevel: 'medium' as const,
    invalidationTags: ['app_lifecycle', 'desktop_mutation'] as readonly RuntimeFactInvalidationTag[],
  },
  focus_app: {
    effectType: 'mutate' as const,
    targetSurface: 'desktop' as const,
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: true,
    approvalScope: 'terminal_and_apps' as const,
    baseRiskLevel: 'medium' as const,
    invalidationTags: ['desktop_mutation'] as readonly RuntimeFactInvalidationTag[],
  },

  terminal_exec: {
    effectType: 'shell' as const,
    targetSurface: 'terminal' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'terminal_and_apps' as const,
    baseRiskLevel: 'high' as const,
    invalidationTags: ['terminal_mutation'] as readonly RuntimeFactInvalidationTag[],
  },
  terminal_reset: {
    effectType: 'shell' as const,
    targetSurface: 'terminal' as const,
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'terminal_and_apps' as const,
    baseRiskLevel: 'medium' as const,
    invalidationTags: ['terminal_mutation'] as readonly RuntimeFactInvalidationTag[],
  },

  coding_apply_patch: {
    effectType: 'mutate' as const,
    targetSurface: 'coding' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action' as const,
    baseRiskLevel: 'high' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },
  coding_write_file: {
    effectType: 'mutate' as const,
    targetSurface: 'coding' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action' as const,
    baseRiskLevel: 'high' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },

  clipboard_write_text: {
    effectType: 'mutate' as const,
    targetSurface: 'system' as const,
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action' as const,
    baseRiskLevel: 'medium' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },
  wait: {
    effectType: 'observe' as const,
    targetSurface: 'system' as const,
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'none' as const,
    baseRiskLevel: 'low' as const,
    invalidationTags: [] as readonly RuntimeFactInvalidationTag[],
  },
} satisfies Record<ActionKind, OperationContractBaseline>

const actionKindContractEntries = (Object.entries(actionKindContractBaselines) as Array<[ActionKind, OperationContractBaseline]>)
  .map(([actionKind, baseline]) => [
    actionKind,
    Object.freeze({
      actionKind,
      ...baseline,
    }),
  ] as const)

export const actionKindOperationContracts: Readonly<Record<ActionKind, OperationContract>> = Object.freeze(
  Object.fromEntries(actionKindContractEntries) as Record<ActionKind, OperationContract>,
)

export const ptyCreateOperationContract: OperationContract = Object.freeze({
  actionKind: 'pty_create',
  effectType: 'shell',
  targetSurface: 'terminal',
  requiresFocus: false,
  idempotent: false,
  reversible: false,
  postconditionRequired: false,
  approvalScope: 'pty_session',
  baseRiskLevel: 'high',
  invalidationTags: ['terminal_mutation'] as readonly RuntimeFactInvalidationTag[],
})

const operationContracts = new Map<OperationContractActionKind, OperationContract>([
  ...actionKindContractEntries,
  ['pty_create', ptyCreateOperationContract],
])

const mutatingEffectTypes: ReadonlySet<OperationEffectType> = new Set([
  'mutate',
  'launch',
  'network',
  'shell',
])

export function getAllOperationContracts(): OperationContract[] {
  return Array.from(operationContracts.values())
}

export function hasOperationContract(actionKind: OperationContractActionKind): boolean {
  return operationContracts.has(actionKind)
}

export function getOperationContract(actionKind: OperationContractActionKind): OperationContract | undefined {
  return operationContracts.get(actionKind)
}

export function requireOperationContract(actionKind: OperationContractActionKind): OperationContract {
  const contract = getOperationContract(actionKind)
  if (!contract) {
    throw new Error(
      `Unknown operation contract for action kind "${actionKind}". All action kinds must have registered operation contracts.`,
    )
  }

  return contract
}

export function isMutatingOperationContract(contract: Pick<OperationContract, 'effectType'>): boolean {
  return mutatingEffectTypes.has(contract.effectType)
}

export function requiresApprovalByDefault(contract: Pick<OperationContract, 'approvalScope'>): boolean {
  return contract.approvalScope !== 'none'
}

/**
 * Returns the invalidation tags declared by an operation contract.
 * Safe to call even when the contract is unknown — returns empty array.
 */
export function getOperationInvalidationTags(actionKind: OperationContractActionKind): readonly RuntimeFactInvalidationTag[] {
  return getOperationContract(actionKind)?.invalidationTags ?? []
}
