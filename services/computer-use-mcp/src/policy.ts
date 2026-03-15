import type { ActionInvocation, ComputerUseConfig, ForegroundContext, PolicyDecision } from './types'

import { resolveConfiguredOpenableApp } from './app-aliases'

function includesPattern(value: string | undefined, patterns: string[]) {
  const normalizedValue = value?.trim().toLowerCase()
  if (!normalizedValue)
    return false

  return patterns.some(pattern => normalizedValue.includes(pattern.toLowerCase()))
}

function isMutatingAction(action: ActionInvocation) {
  return !['screenshot', 'observe_windows', 'wait', 'terminal_reset', 'clipboard_read_text', 'secret_read_env_value'].includes(action.kind)
}

function isUiInteractionAction(action: ActionInvocation) {
  return ['click', 'type_text', 'press_keys', 'scroll', 'open_app', 'focus_app'].includes(action.kind)
}

function getCoordinate(action: ActionInvocation) {
  switch (action.kind) {
    case 'click':
      return { x: action.input.x, y: action.input.y }
    case 'type_text':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    case 'scroll':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    default:
      return undefined
  }
}

function estimateOperationUnits(action: ActionInvocation) {
  switch (action.kind) {
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

// NOTICE: Key aliases must be normalised to canonical names so the
// denied-shortcuts set matches regardless of how the caller spells them.
// See: macOS modifier naming conventions.
const keyAliases: Record<string, string> = {
  cmd: 'command',
  meta: 'command',
  opt: 'option',
  ctrl: 'control',
}

function normalizeShortcut(keys: string[]) {
  return keys
    .map((key) => {
      const lower = key.trim().toLowerCase()
      return keyAliases[lower] ?? lower
    })
    .sort()
    .join('+')
}

const deniedShortcuts = new Set([
  'command+q',
  'command+space',
  'command+tab',
  'alt+tab',
  'option+tab',
])

export function evaluateActionPolicy(params: {
  action: ActionInvocation
  config: ComputerUseConfig
  context: ForegroundContext
  operationsExecuted: number
  operationUnitsConsumed: number
}): PolicyDecision {
  const reasons: string[] = []
  const estimatedOperationUnits = estimateOperationUnits(params.action)
  const mutating = isMutatingAction(params.action)
  let allowed = true
  let requiresApproval = false
  let riskLevel: PolicyDecision['riskLevel'] = 'low'

  if (params.operationsExecuted >= params.config.maxOperations) {
    reasons.push('session operation budget exhausted')
    allowed = false
  }

  if ((params.operationUnitsConsumed + estimatedOperationUnits) > params.config.maxOperationUnits) {
    reasons.push('session operation-unit budget exhausted')
    allowed = false
  }

  const coordinate = getCoordinate(params.action)
  if (coordinate && params.config.allowedBounds) {
    const { x, y } = coordinate
    const { allowedBounds } = params.config
    const withinBounds = x >= allowedBounds.x
      && y >= allowedBounds.y
      && x <= (allowedBounds.x + allowedBounds.width)
      && y <= (allowedBounds.y + allowedBounds.height)

    if (!withinBounds) {
      reasons.push('requested coordinate is outside the allowed bounds')
      allowed = false
    }
  }

  if (isUiInteractionAction(params.action) && params.context.available) {
    if (includesPattern(params.context.appName, params.config.denyApps)) {
      reasons.push(`foreground app denied: ${params.context.appName}`)
      allowed = false
    }

    if (includesPattern(params.context.windowTitle, params.config.denyWindowTitles)) {
      reasons.push(`foreground window denied: ${params.context.windowTitle}`)
      allowed = false
    }
  }
  else if (mutating && isUiInteractionAction(params.action) && !params.context.available && params.action.kind !== 'open_app' && params.action.kind !== 'focus_app') {
    reasons.push(`foreground context unavailable: ${params.context.unavailableReason || 'unknown reason'}`)
    requiresApproval = params.config.approvalMode !== 'never'
  }

  if (params.action.kind === 'open_app' || params.action.kind === 'focus_app') {
    if (params.config.executor === 'linux-x11') {
      reasons.push('linux-x11 executor does not support app open/focus actions in this legacy path')
      allowed = false
    }

    const resolvedApp = resolveConfiguredOpenableApp(params.action.input.app, params.config.openableApps)
    if (!resolvedApp) {
      reasons.push(`app is not in COMPUTER_USE_OPENABLE_APPS: ${params.action.input.app}`)
      allowed = false
    }
    if (includesPattern(resolvedApp || params.action.input.app, params.config.denyApps)) {
      reasons.push(`app denied by policy: ${resolvedApp || params.action.input.app}`)
      allowed = false
    }
    requiresApproval = true
    riskLevel = 'medium'
  }

  if (params.action.kind === 'press_keys') {
    const shortcut = normalizeShortcut(params.action.input.keys)
    if (deniedShortcuts.has(shortcut)) {
      reasons.push(`shortcut denied by default policy: ${shortcut}`)
      allowed = false
    }
  }

  if (params.action.kind === 'type_text' && params.action.input.text.length > 160) {
    reasons.push('typing a long payload should be reviewed')
    requiresApproval = true
    riskLevel = 'high'
  }

  if (params.action.kind === 'terminal_exec') {
    requiresApproval = true
    riskLevel = 'high'
  }

  if (params.action.kind === 'clipboard_read_text' || params.action.kind === 'clipboard_write_text' || params.action.kind === 'secret_read_env_value') {
    requiresApproval = true
    riskLevel = 'high'
  }

  if (params.action.kind === 'click' || params.action.kind === 'press_keys' || params.action.kind === 'scroll') {
    riskLevel = 'medium'
  }

  if (params.action.kind === 'type_text') {
    riskLevel = 'high'
  }

  if (params.config.approvalMode === 'never') {
    // NOTICE: 'never' mode overrides all per-action approval flags.
    // This is intentional for automated/demo scenarios.
    requiresApproval = false
  }
  else if (params.config.approvalMode === 'all') {
    requiresApproval = true
  }
  else if (params.config.approvalMode === 'actions' && mutating && params.action.kind !== 'terminal_exec' && params.action.kind !== 'open_app' && params.action.kind !== 'focus_app') {
    requiresApproval = true
  }

  return {
    allowed,
    requiresApproval,
    reason: reasons[0],
    reasons,
    riskLevel,
    estimatedOperationUnits,
  }
}
