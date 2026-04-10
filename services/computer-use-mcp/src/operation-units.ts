import type { ActionInvocation } from './types'

export function estimateOperationUnits(action: ActionInvocation) {
  switch (action.kind) {
    case 'coding_apply_patch':
    case 'coding_write_file':
      return 5
    case 'coding_review_workspace':
    case 'coding_read_file':
    case 'coding_compress_context':
    case 'coding_report_status':
    case 'coding_search_text':
    case 'coding_search_symbol':
    case 'coding_find_references':
    case 'coding_analyze_impact':
    case 'coding_validate_hypothesis':
    case 'coding_select_target':
    case 'coding_plan_changes':
    case 'coding_review_changes':
    case 'coding_diagnose_changes':
    case 'coding_capture_validation_baseline':
    case 'coding_list_files':
      return 1

    case 'screenshot':
      return 3
    case 'observe_windows':
      return 1
    case 'open_app':
    case 'focus_app':
      return 2
    case 'clipboard_read_text':
    case 'secret_read_env_value':
      return 1
    case 'clipboard_write_text':
      return Math.max(2, Math.ceil(action.input.text.length / 64))
    case 'click':
      return 1
    case 'type_text':
      return Math.max(2, Math.ceil(action.input.text.length / 48))
    case 'press_keys':
      return 1
    case 'scroll':
      return 1
    case 'wait':
      return 1
    case 'terminal_exec':
      return Math.max(4, Math.ceil(action.input.command.length / 48))
    case 'terminal_reset':
      return 1
  }
}
