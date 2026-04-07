import type { ActionKind } from '../types'

import { describe, expect, it } from 'vitest'

import { getAllOperationContracts, requireOperationContract } from '../operation-contracts'
import {
  getAllVerificationContracts,
  requireVerificationContract,
} from './index'

const _allActionKinds = [
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
] as const satisfies readonly ActionKind[]

type MissingActionKinds = Exclude<ActionKind, (typeof _allActionKinds)[number]>
const assertNoMissingActionKinds: MissingActionKinds extends never ? true : never = true
void assertNoMissingActionKinds

describe('verificationContracts', () => {
  it('covers all current OperationContractActionKind values', () => {
    const operationActionKinds = getAllOperationContracts().map(contract => contract.actionKind)
    for (const actionKind of operationActionKinds) {
      const contract = requireVerificationContract(actionKind)
      expect(contract.actionKind).toBe(actionKind)
    }
  })

  it('fails closed when a contract is missing', () => {
    expect(() => requireVerificationContract('nonexistent_action' as ActionKind)).toThrow(/Unknown verification contract/)
  })

  it('enforces postcondition-required operations as verification-required', () => {
    const verificationContracts = getAllVerificationContracts()
    for (const contract of verificationContracts) {
      const operationContract = requireOperationContract(contract.actionKind)
      if (operationContract.postconditionRequired) {
        expect(contract.requirement).toBe('required')
      }
    }
  })

  it('enforces method=none implies requirement=none', () => {
    const verificationContracts = getAllVerificationContracts()
    for (const contract of verificationContracts) {
      if (contract.method === 'none') {
        expect(contract.requirement).toBe('none')
      }
    }
  })

  it('enforces non-repair disposition must use repairHint=none', () => {
    const verificationContracts = getAllVerificationContracts()
    for (const contract of verificationContracts) {
      if (contract.failureDisposition !== 'repair_hint') {
        expect(contract.repairHint).toBe('none')
      }
    }
  })

  it('keeps click as required + surface_observation_refresh', () => {
    expect(requireVerificationContract('click')).toMatchObject({
      requirement: 'required',
      method: 'surface_observation_refresh',
    })
  })

  it('keeps open_app and focus_app as required + foreground_match', () => {
    expect(requireVerificationContract('open_app')).toMatchObject({
      requirement: 'required',
      method: 'foreground_match',
    })
    expect(requireVerificationContract('focus_app')).toMatchObject({
      requirement: 'required',
      method: 'foreground_match',
    })
  })

  it('keeps pty_create as required + pty_binding', () => {
    expect(requireVerificationContract('pty_create')).toMatchObject({
      requirement: 'required',
      method: 'pty_binding',
    })
  })

  it('keeps coding_apply_patch as best_effort + coding_state', () => {
    expect(requireVerificationContract('coding_apply_patch')).toMatchObject({
      requirement: 'best_effort',
      method: 'coding_state',
    })
  })

  it('keeps terminal_exec verification disabled', () => {
    expect(requireVerificationContract('terminal_exec')).toMatchObject({
      requirement: 'none',
      method: 'none',
      failureDisposition: 'record_only',
      repairHint: 'none',
    })
  })
})
