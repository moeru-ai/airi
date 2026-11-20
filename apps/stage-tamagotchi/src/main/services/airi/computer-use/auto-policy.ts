import type { TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import type { AutoApprovalCard } from '../../../../shared/eventa/terminal-approval'

import path from 'node:path'

/** A review card above this size is refused instead of being truncated or sent. */
export const AUTO_REVIEW_CARD_MAX_BYTES = 2048

export type AutoDecision
  = { outcome: 'allow', reason: string }
    | { outcome: 'refuse', reason: string }
    | { outcome: 'review', reason: string, card: AutoApprovalCard }

const READ_ONLY_LIST = new Set(['pwd', 'ls', 'get-location', 'get-childitem'])
const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show'])
const PRIVILEGE_COMMANDS = new Set([
  'sudo',
  'su',
  'doas',
  'runas',
  'gsudo',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'format',
  'mkfs',
  'diskpart',
  'dd',
])
const SECRET_NAMES = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'credentials',
  'credentials.json',
  'secrets',
  'keychain',
])
const DESKTOP_ALLOW = new Set(['scroll', 'wait'])
const DESKTOP_REVIEW = new Set([
  'click',
  'desktop_click_target',
  'type_text',
  'press_keys',
  'open_app',
  'focus_app',
  'browser_dom_click',
  'browser_dom_set_input_value',
  'browser_dom_check_checkbox',
  'browser_dom_select_option',
  'browser_dom_trigger_event',
])
const WINDOW_DENY = [/password/i, /passcode/i, /keychain/i, /1password/i, /bitwarden/i, /authenticator/i, /wallet/i, /seed phrase/i, /keepass/i, /lastpass/i, /dashlane/i]

export interface ComputerUseAutoInput {
  actionKind: string
  appName?: string
  windowTitle?: string
  contextAvailable: boolean
  action?: { kind?: string, input?: Record<string, unknown> }
}

/**
 * Decides whether one frozen Shell command may run under Command Auto.
 * The cage refuses anything it cannot prove, and it never asks the model to widen that result.
 */
export function decideCommandAuto(snapshot: TerminalSnapshot, workspaceRoot: string): AutoDecision {
  const tokens = parseSimpleCommand(snapshot.command)
  if (!tokens)
    return { outcome: 'refuse', reason: 'The command could not be checked safely.' }
  if (mentionsSecret(snapshot.command) || isPrivilegeCommand(tokens))
    return { outcome: 'refuse', reason: 'The command reaches secrets or a privileged operation.' }
  const platform = snapshot.executorPlatform
  if (!isInsideRoot(workspaceRoot, snapshot.effectiveCwd, platform))
    return { outcome: 'refuse', reason: 'The command directory is outside the Auto workspace.' }
  for (const token of tokens) {
    const located = filesystemPath(token, snapshot.effectiveCwd, platform)
    if (located === 'unsafe' || (located !== 'skip' && !isInsideRoot(workspaceRoot, located, platform)))
      return { outcome: 'refuse', reason: 'The command reaches a path outside the Auto workspace.' }
  }
  if (isReadOnlyCommand(tokens))
    return { outcome: 'allow', reason: 'The command is read-only inside the Auto workspace.' }
  const card: AutoApprovalCard = {
    lane: 'terminal',
    cwd: relativeCwd(workspaceRoot, snapshot.effectiveCwd, platform),
    command: snapshot.command,
  }
  if (cardBytes(card) > AUTO_REVIEW_CARD_MAX_BYTES)
    return { outcome: 'refuse', reason: 'The action card is too long to review.' }
  return { outcome: 'review', reason: 'The command changes the Auto workspace.', card }
}

/**
 * Decides whether one frozen desktop action may run under Computer Use Auto.
 * Observation of the foreground window is required. A denied window title is refused before review.
 */
export function decideComputerUseAuto(input: ComputerUseAutoInput): AutoDecision {
  if (!input.contextAvailable)
    return { outcome: 'refuse', reason: 'Computer Use Auto cannot see the foreground window.' }
  if (isDeniedWindow(input.appName) || isDeniedWindow(input.windowTitle))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses this application.' }
  if (input.actionKind === 'clipboard_read_text' || input.actionKind === 'clipboard_write_text' || input.actionKind === 'secret_read_env_value' || input.actionKind.startsWith('pty_'))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses clipboard, secrets, and new terminals.' }
  if (DESKTOP_ALLOW.has(input.actionKind))
    return { outcome: 'allow', reason: 'The desktop action does not change input.' }
  if (!DESKTOP_REVIEW.has(input.actionKind))
    return { outcome: 'refuse', reason: 'Computer Use Auto does not recognize this action.' }
  const card: AutoApprovalCard = {
    lane: 'computer_use',
    actionKind: input.actionKind,
    appName: input.appName ?? '',
    windowTitle: input.windowTitle ?? '',
    detail: desktopDetail(input),
  }
  if (cardBytes(card) > AUTO_REVIEW_CARD_MAX_BYTES)
    return { outcome: 'refuse', reason: 'The action card is too long to review.' }
  return { outcome: 'review', reason: 'The desktop action needs review.', card }
}

/**
 * Ask may commit a narrow read-only command without a dialog.
 * Path arguments still wait, because Ask has no workspace cage.
 */
export function isAskReadOnlyCommand(snapshot: TerminalSnapshot): boolean {
  const tokens = parseSimpleCommand(snapshot.command)
  if (!tokens || mentionsSecret(snapshot.command) || isPrivilegeCommand(tokens))
    return false
  const name = commandName(tokens[0])
  const flagsOnly = tokens.slice(name === 'git' ? 2 : 1).every(token => token.startsWith('-') && !token.includes('='))
  if (name === 'pwd' || name === 'get-location' || name === 'ls' || name === 'get-childitem')
    return flagsOnly
  if (name === 'git') {
    const subcommand = tokens[1]?.toLowerCase()
    return subcommand !== undefined && READ_ONLY_GIT.has(subcommand) && flagsOnly
  }
  return false
}

export function cardBytes(card: AutoApprovalCard): number {
  return new TextEncoder().encode(JSON.stringify(card)).byteLength
}

function parseSimpleCommand(command: string): string[] | undefined {
  if (/\bInvoke-Expression\b/i.test(command) || /\biex\b/i.test(command) || /-EncodedCommand/i.test(command))
    return undefined
  const tokens: string[] = []
  let current = ''
  let quote: '\'' | '"' | undefined
  for (const char of command) {
    if (quote === '\'') {
      if (char === '\'')
        quote = undefined
      else
        current += char
      continue
    }
    if (quote === '"') {
      if (char === '"') {
        quote = undefined
        continue
      }
      if (char === '$' || char === '`' || char === '\\' || char === '!')
        return undefined
      current += char
      continue
    }
    if (char === '\'' || char === '"') {
      quote = char
      continue
    }
    if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    if ('\n\r;&|<>`$(){}'.includes(char))
      return undefined
    current += char
  }
  if (quote)
    return undefined
  if (current)
    tokens.push(current)
  return tokens.length > 0 ? tokens : undefined
}

function isReadOnlyCommand(tokens: string[]): boolean {
  const name = commandName(tokens[0])
  if (READ_ONLY_LIST.has(name))
    return true
  if (name !== 'git')
    return false
  const subcommand = tokens[1]?.toLowerCase()
  return subcommand !== undefined && READ_ONLY_GIT.has(subcommand) && tokens.slice(2).every(token => token.startsWith('-'))
}

function isPrivilegeCommand(tokens: string[]): boolean {
  return PRIVILEGE_COMMANDS.has(commandName(tokens[0]))
}

function mentionsSecret(command: string): boolean {
  return command.split(/[\s\\/]+/).some((part) => {
    const name = part.trim().toLowerCase().replace(/^['"]+|['"]+$/g, '')
    return SECRET_NAMES.has(name) || name.startsWith('.env')
  })
}

function commandName(token: string): string {
  const normalized = token.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return (slash >= 0 ? normalized.slice(slash + 1) : normalized).toLowerCase()
}

function filesystemPath(token: string, cwd: string, platform: string): string | 'skip' | 'unsafe' {
  if (token === '--')
    return 'skip'
  if (token.startsWith('-')) {
    const separator = token.indexOf('=')
    if (separator === -1)
      return 'skip'
    const value = token.slice(separator + 1)
    return value ? filesystemPath(value, cwd, platform) : 'skip'
  }
  if (token.startsWith('~'))
    return 'unsafe'
  const looksLikePath = token.startsWith('/')
    || token.startsWith('\\')
    || token.startsWith('.')
    || /^[A-Z]:[\\/]/i.test(token)
    || token.includes('\\')
    || (token.includes('/') && !token.includes('://'))
  if (!looksLikePath)
    return 'skip'
  const api = pathApi(platform)
  return api.isAbsolute(token) ? api.normalize(token) : api.resolve(cwd, token)
}

function isInsideRoot(root: string, target: string, platform: string): boolean {
  const api = pathApi(platform)
  const rootResolved = normalizeForCompare(api.resolve(root), platform)
  const targetResolved = normalizeForCompare(api.resolve(target), platform)
  const relative = api.relative(rootResolved, targetResolved)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative))
}

function relativeCwd(root: string, cwd: string, platform: string): string {
  const api = pathApi(platform)
  const relative = api.relative(api.resolve(root), api.resolve(cwd))
  return relative === '' ? '.' : relative
}

function normalizeForCompare(value: string, platform: string): string {
  return platform === 'win32' ? value.toLowerCase() : value
}

function pathApi(platform: string) {
  return platform === 'win32' ? path.win32 : path.posix
}

function isDeniedWindow(value: string | undefined): boolean {
  return value !== undefined && WINDOW_DENY.some(pattern => pattern.test(value))
}

function desktopDetail(input: ComputerUseAutoInput): string {
  const fields = input.action?.input ?? {}
  if (input.actionKind === 'click')
    return typeof fields.x === 'number' && typeof fields.y === 'number' ? `${fields.x},${fields.y}` : ''
  if (input.actionKind === 'type_text')
    return `chars:${typeof fields.text === 'string' ? fields.text.length : 0}`
  if (input.actionKind === 'press_keys')
    return Array.isArray(fields.keys) ? fields.keys.filter((key): key is string => typeof key === 'string').join('+') : ''
  if (input.actionKind === 'open_app' || input.actionKind === 'focus_app')
    return typeof fields.app === 'string' ? fields.app : ''
  if (input.actionKind.startsWith('browser_dom_'))
    return `selectorChars:${typeof fields.selector === 'string' ? fields.selector.length : 0}`
  if (input.actionKind === 'desktop_click_target')
    return typeof fields.candidateId === 'string' ? fields.candidateId.slice(0, 80) : ''
  return ''
}
