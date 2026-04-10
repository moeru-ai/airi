import type { ActionKind } from '../types'

import { describe, expect, it } from 'vitest'

import {
  getAllOperationContracts,
  isMutatingOperationContract,
  requireOperationContract,
} from './index'

const allActionKinds = [
  'screenshot',
  'observe_windows',
  'open_app',
  'focus_app',
  'secret_read_env_value',
  'clipboard_read_text',
  'clipboard_write_text',
  'click',
  'type_text',
  'press_keys',
  'scroll',
  'wait',
  'terminal_exec',
  'terminal_reset',
  'coding_review_workspace',
  'coding_read_file',
  'coding_apply_patch',
  'coding_compress_context',
  'coding_report_status',
  'coding_search_text',
  'coding_search_symbol',
  'coding_find_references',
  'coding_analyze_impact',
  'coding_validate_hypothesis',
  'coding_select_target',
  'coding_plan_changes',
  'coding_review_changes',
  'coding_diagnose_changes',
  'coding_capture_validation_baseline',
  'coding_write_file',
  'coding_list_files',
  'coding_agentic_run',
] as const satisfies readonly ActionKind[]

type MissingActionKinds = Exclude<ActionKind, (typeof allActionKinds)[number]>
const assertNoMissingActionKinds: MissingActionKinds extends never ? true : never = true
void assertNoMissingActionKinds

describe('operationContracts', () => {
  it('covers all current ActionKind values', () => {
    for (const actionKind of allActionKinds) {
      const contract = requireOperationContract(actionKind)
      expect(contract.actionKind).toBe(actionKind)
    }
  })

  it('keeps unique keys and valid approval scopes', () => {
    const contracts = getAllOperationContracts()
    const uniqueActionKinds = new Set(contracts.map(contract => contract.actionKind))

    expect(uniqueActionKinds.size).toBe(contracts.length)

    const allowedScopes = new Set(['none', 'per_action', 'terminal_and_apps', 'pty_session'])
    for (const contract of contracts) {
      expect(allowedScopes.has(contract.approvalScope)).toBe(true)
    }
  })

  it('fails closed when a contract is missing', () => {
    expect(() => requireOperationContract('nonexistent_action' as ActionKind)).toThrow(/Unknown operation contract/)
  })

  it('marks desktop mutation actions as mutate + focus-required', () => {
    for (const actionKind of ['click', 'type_text', 'press_keys', 'scroll'] as const) {
      const contract = requireOperationContract(actionKind)
      expect(isMutatingOperationContract(contract)).toBe(true)
      expect(contract.requiresFocus).toBe(true)
    }
  })

  it('keeps screenshot/observe/coding read operations non-mutating', () => {
    for (const actionKind of ['screenshot', 'observe_windows', 'coding_read_file', 'coding_search_text'] as const) {
      const contract = requireOperationContract(actionKind)
      expect(isMutatingOperationContract(contract)).toBe(false)
    }
  })

  it('assigns pty_create to pty_session approval scope', () => {
    expect(requireOperationContract('pty_create').approvalScope).toBe('pty_session')
  })

  it('keeps coding_apply_patch baseline risk at high', () => {
    expect(requireOperationContract('coding_apply_patch').baseRiskLevel).toBe('high')
  })
})
