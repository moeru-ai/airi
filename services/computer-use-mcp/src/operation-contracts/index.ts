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
}

const actionKindContractBaselines = {
  screenshot: observeReadDesktopBaseline,
  observe_windows: observeReadDesktopBaseline,
  clipboard_read_text: {
    effectType: 'read',
    targetSurface: 'system',
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'none',
    baseRiskLevel: 'low',
  },
  secret_read_env_value: {
    effectType: 'read',
    targetSurface: 'system',
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action',
    baseRiskLevel: 'medium',
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

  click: desktopMutateBaseline,
  type_text: desktopMutateBaseline,
  press_keys: desktopMutateBaseline,
  scroll: desktopMutateBaseline,

  open_app: {
    effectType: 'launch',
    targetSurface: 'desktop',
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: true,
    approvalScope: 'terminal_and_apps',
    baseRiskLevel: 'medium',
  },
  focus_app: {
    effectType: 'mutate',
    targetSurface: 'desktop',
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: true,
    approvalScope: 'terminal_and_apps',
    baseRiskLevel: 'medium',
  },

  terminal_exec: {
    effectType: 'shell',
    targetSurface: 'terminal',
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'terminal_and_apps',
    baseRiskLevel: 'high',
  },
  terminal_reset: {
    effectType: 'shell',
    targetSurface: 'terminal',
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'terminal_and_apps',
    baseRiskLevel: 'medium',
  },

  coding_apply_patch: {
    effectType: 'mutate',
    targetSurface: 'coding',
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action',
    baseRiskLevel: 'high',
  },

  clipboard_write_text: {
    effectType: 'mutate',
    targetSurface: 'system',
    requiresFocus: false,
    idempotent: false,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'per_action',
    baseRiskLevel: 'medium',
  },
  wait: {
    effectType: 'observe',
    targetSurface: 'system',
    requiresFocus: false,
    idempotent: true,
    reversible: false,
    postconditionRequired: false,
    approvalScope: 'none',
    baseRiskLevel: 'low',
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
