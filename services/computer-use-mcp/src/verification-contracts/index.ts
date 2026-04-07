import type { OperationContractActionKind } from '../operation-contracts'
import type { ActionKind } from '../types'

import {
  requireOperationContract,
} from '../operation-contracts'

export type VerificationRequirement = 'none' | 'best_effort' | 'required'
export type VerificationMethod = 'none' | 'surface_observation_refresh' | 'foreground_match' | 'window_presence' | 'terminal_result' | 'pty_binding' | 'coding_state' | 'clipboard_state'

export type VerificationEvidenceKind = 'foreground_context' | 'window_observation' | 'screenshot_artifact' | 'terminal_result' | 'terminal_state' | 'pty_binding' | 'coding_state' | 'clipboard_state'

export type VerificationFailureDisposition = 'record_only' | 'repair_hint' | 'reroute' | 'abort'
export type VerificationRepairHint = 'none' | 'refresh_surface_observation' | 'refocus_target_app' | 'reopen_target_app' | 'rebind_pty_session' | 'recheck_patch' | 'recheck_clipboard'

export interface VerificationContract {
  actionKind: OperationContractActionKind
  requirement: VerificationRequirement
  method: VerificationMethod
  evidenceKinds: VerificationEvidenceKind[]
  failureDisposition: VerificationFailureDisposition
  repairHint: VerificationRepairHint
}

export interface VerificationContractSummary {
  requirement: VerificationRequirement
  method: VerificationMethod
  failureDisposition: VerificationFailureDisposition
  repairHint: VerificationRepairHint
}

type VerificationContractBaseline = Omit<VerificationContract, 'actionKind'>

const noVerificationBaseline: VerificationContractBaseline = {
  requirement: 'none',
  method: 'none',
  evidenceKinds: [],
  failureDisposition: 'record_only',
  repairHint: 'none',
}

const uiMutationVerificationBaseline: VerificationContractBaseline = {
  requirement: 'required',
  method: 'surface_observation_refresh',
  evidenceKinds: ['foreground_context', 'screenshot_artifact'],
  failureDisposition: 'repair_hint',
  repairHint: 'refresh_surface_observation',
}

const actionKindVerificationBaselines = {
  screenshot: noVerificationBaseline,
  observe_windows: noVerificationBaseline,
  secret_read_env_value: noVerificationBaseline,
  clipboard_read_text: noVerificationBaseline,
  wait: noVerificationBaseline,
  terminal_exec: noVerificationBaseline,
  terminal_reset: noVerificationBaseline,

  coding_review_workspace: noVerificationBaseline,
  coding_read_file: noVerificationBaseline,
  coding_compress_context: noVerificationBaseline,
  coding_report_status: noVerificationBaseline,
  coding_search_text: noVerificationBaseline,
  coding_search_symbol: noVerificationBaseline,
  coding_find_references: noVerificationBaseline,
  coding_analyze_impact: noVerificationBaseline,
  coding_validate_hypothesis: noVerificationBaseline,
  coding_select_target: noVerificationBaseline,
  coding_plan_changes: noVerificationBaseline,
  coding_review_changes: noVerificationBaseline,
  coding_diagnose_changes: noVerificationBaseline,
  coding_capture_validation_baseline: noVerificationBaseline,

  click: uiMutationVerificationBaseline,
  type_text: uiMutationVerificationBaseline,
  press_keys: uiMutationVerificationBaseline,
  scroll: uiMutationVerificationBaseline,

  open_app: {
    requirement: 'required',
    method: 'foreground_match',
    evidenceKinds: ['foreground_context', 'window_observation'],
    failureDisposition: 'repair_hint',
    repairHint: 'reopen_target_app',
  },
  focus_app: {
    requirement: 'required',
    method: 'foreground_match',
    evidenceKinds: ['foreground_context', 'window_observation'],
    failureDisposition: 'repair_hint',
    repairHint: 'refocus_target_app',
  },

  coding_apply_patch: {
    requirement: 'best_effort',
    method: 'coding_state',
    evidenceKinds: ['coding_state'],
    failureDisposition: 'repair_hint',
    repairHint: 'recheck_patch',
  },

  clipboard_write_text: {
    requirement: 'best_effort',
    method: 'clipboard_state',
    evidenceKinds: ['clipboard_state'],
    failureDisposition: 'repair_hint',
    repairHint: 'recheck_clipboard',
  },
} satisfies Record<ActionKind, VerificationContractBaseline>

const actionKindVerificationEntries = (Object.entries(actionKindVerificationBaselines) as Array<[ActionKind, VerificationContractBaseline]>)
  .map(([actionKind, baseline]) => [
    actionKind,
    Object.freeze({
      actionKind,
      ...baseline,
    }),
  ] as const)

export const actionKindVerificationContracts: Readonly<Record<ActionKind, VerificationContract>> = Object.freeze(
  Object.fromEntries(actionKindVerificationEntries) as Record<ActionKind, VerificationContract>,
)

export const ptyCreateVerificationContract: VerificationContract = Object.freeze({
  actionKind: 'pty_create',
  requirement: 'required',
  method: 'pty_binding',
  evidenceKinds: ['pty_binding', 'terminal_state'] as VerificationEvidenceKind[],
  failureDisposition: 'abort',
  repairHint: 'none',
})

const verificationContracts = new Map<OperationContractActionKind, VerificationContract>([
  ...actionKindVerificationEntries,
  ['pty_create', ptyCreateVerificationContract],
])

function assertVerificationContractInvariants() {
  const allContracts = Array.from(verificationContracts.values())

  for (const contract of allContracts) {
    const operationContract = requireOperationContract(contract.actionKind)

    if (operationContract.postconditionRequired && contract.requirement !== 'required') {
      throw new Error(
        `Invalid verification contract for action kind "${contract.actionKind}": postcondition-required operations must use requirement="required".`,
      )
    }

    if (contract.method === 'none' && contract.requirement !== 'none') {
      throw new Error(
        `Invalid verification contract for action kind "${contract.actionKind}": method="none" requires requirement="none".`,
      )
    }

    if (contract.failureDisposition !== 'repair_hint' && contract.repairHint !== 'none') {
      throw new Error(
        `Invalid verification contract for action kind "${contract.actionKind}": repairHint must be "none" unless failureDisposition="repair_hint".`,
      )
    }
  }
}

assertVerificationContractInvariants()

export function getAllVerificationContracts(): VerificationContract[] {
  return Array.from(verificationContracts.values())
}

export function hasVerificationContract(actionKind: OperationContractActionKind): boolean {
  return verificationContracts.has(actionKind)
}

export function getVerificationContract(actionKind: OperationContractActionKind): VerificationContract | undefined {
  return verificationContracts.get(actionKind)
}

export function requireVerificationContract(actionKind: OperationContractActionKind): VerificationContract {
  const contract = getVerificationContract(actionKind)
  if (!contract) {
    throw new Error(
      `Unknown verification contract for action kind "${actionKind}". All operation action kinds must have registered verification contracts.`,
    )
  }

  return contract
}

export function toVerificationContractSummary(contract: Pick<VerificationContract, 'requirement' | 'method' | 'failureDisposition' | 'repairHint'>): VerificationContractSummary {
  return {
    requirement: contract.requirement,
    method: contract.method,
    failureDisposition: contract.failureDisposition,
    repairHint: contract.repairHint,
  }
}
