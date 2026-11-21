import type { TerminalSnapshot } from '@proj-airi/stage-shared/terminal-approval'

import type { AutoApprovalCard } from '../../../../shared/eventa/terminal-approval'

import fs from 'node:fs'
import path from 'node:path'

/** A review card above this size is refused instead of being truncated or sent. */
export const AUTO_REVIEW_CARD_MAX_BYTES = 2048

export type AutoDecision
  = { outcome: 'allow', reason: string }
    | { outcome: 'refuse', reason: string }
    | { outcome: 'review', reason: string, card: AutoApprovalCard }

const READ_ONLY_LIST = new Set(['pwd', 'ls', 'get-location', 'get-childitem'])
const READ_ONLY_GIT = new Set(['status', 'log', 'show'])
const DELETE_COMMANDS = new Set(['rm', 'del', 'remove-item'])
const WRITE_COMMANDS = new Set(['mkdir', 'mv', 'cp', 'move-item', 'copy-item', 'set-content', 'out-file', 'new-item'])
const REFUSE_COMMANDS = new Set([
  'python',
  'python3',
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'cmd',
  'bash',
  'sh',
  'zsh',
  'curl',
  'wget',
  'ssh',
  'scp',
  'ftp',
  'invoke-expression',
  'iex',
])
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
const DESKTOP_ALLOW = new Set(['wait'])
const DESKTOP_REVIEW = new Set([
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
const BROWSER_MUTATION_FIELDS: Record<string, readonly string[]> = {
  browser_dom_set_input_value: ['value', 'simulateKeystrokes', 'blur'],
  browser_dom_select_option: ['value', 'option', 'label'],
  browser_dom_check_checkbox: ['checked'],
  browser_dom_trigger_event: ['eventName', 'eventType', 'opts', 'event'],
}
const WINDOW_DENY = [
  /password/i,
  /passcode/i,
  /keychain/i,
  /1password/i,
  /bitwarden/i,
  /authenticator/i,
  /wallet/i,
  /seed phrase/i,
  /keepass/i,
  /lastpass/i,
  /dashlane/i,
  /密码/,
  /口令/,
  /钱包/,
  /剪贴板/,
  /密钥/,
]
const TERMINAL_WINDOW = [
  /\bterminal\b/i,
  /\bconsole\b/i,
  /\bcommand prompt\b/i,
  /\bpowershell\b/i,
  /\b(?:cmd|pwsh)(?:\.exe)?\b/i,
  /\biterm2?\b/i,
  /\bwezterm\b/i,
  /\balacritty\b/i,
  /\bkitty\b/i,
]

export interface ComputerUseAutoInput {
  frozenAppName: string
  actionKind: string
  appName?: string
  windowTitle?: string
  contextAvailable: boolean
  targetLabel?: string
  action?: { kind?: string, input?: Record<string, unknown> }
}

export interface ForegroundContextLike {
  available: boolean
  appName?: string
  windowTitle?: string
}

/** A denied foreground application blocks Computer Use Auto grant. */
export function isAutoGrantForegroundDenied(appName?: string, windowTitle?: string): boolean {
  return isDeniedWindow(appName) || isDeniedWindow(windowTitle) || isTerminalWindow(appName) || isTerminalWindow(windowTitle)
}

/** Compares one frozen application name with the current name. The match is exact after trimming, ignoring case. */
export function appsMatchForAuto(frozenAppName: string, currentAppName: string | undefined): boolean {
  const frozen = normalizeAppName(frozenAppName)
  const current = normalizeAppName(currentAppName ?? '')
  return frozen.length > 0 && frozen === current
}

/** Rejects dispatch when the foreground window no longer matches a review card. */
export function foregroundMatchesComputerCard(card: AutoApprovalCard, context: ForegroundContextLike): boolean {
  if (card.lane !== 'computer_use' || !context.available)
    return false
  if (!appsMatchForAuto(card.appName, context.appName))
    return false
  const title = context.windowTitle?.trim() ?? ''
  return title === card.windowTitle
}

/**
 * Decides whether one frozen Shell command may run under Command Auto.
 * The cage refuses anything it cannot prove, and it never asks the model to widen that result.
 */
export function decideCommandAuto(snapshot: TerminalSnapshot, workspaceRoot: string): AutoDecision {
  const tokens = parseSimpleCommand(snapshot.command, snapshot.executorPlatform)
  if (!tokens)
    return { outcome: 'refuse', reason: 'The command could not be checked safely.' }
  if (mentionsSecret(tokens) || isPrivilegeCommand(tokens))
    return { outcome: 'refuse', reason: 'The command reaches secrets or a privileged operation.' }
  const platform = snapshot.executorPlatform
  const workspace = resolveExistingPath(workspaceRoot, platform)
  const effectiveCwd = resolveExistingPath(snapshot.effectiveCwd, platform)
  if (!isInsideRoot(workspace, effectiveCwd, platform))
    return { outcome: 'refuse', reason: 'The command directory is outside the Auto workspace.' }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const checkBareExisting = index > 0 && !token.startsWith('-')
    const located = resolvePathToken(token, effectiveCwd, platform, checkBareExisting)
    if (located === 'unsafe' || (located !== 'skip' && !isInsideRoot(workspace, located, platform)))
      return { outcome: 'refuse', reason: 'The command reaches a path outside the Auto workspace.' }
  }
  if (isReadOnlyCommand(tokens))
    return { outcome: 'allow', reason: 'The command is read-only inside the Auto workspace.' }

  if (isBroadDelete(tokens, workspace, effectiveCwd, platform))
    return { outcome: 'refuse', reason: 'The command removes too much of the Auto workspace.' }

  const reviewClass = commandReviewClass(tokens)
  if (!reviewClass)
    return { outcome: 'refuse', reason: 'Command Auto does not allow this command.' }

  const card: AutoApprovalCard = {
    lane: 'terminal',
    cwd: relativeCwd(workspace, effectiveCwd, platform),
    command: snapshot.command,
    reviewClass,
  }
  if (cardBytes(card) > AUTO_REVIEW_CARD_MAX_BYTES)
    return { outcome: 'refuse', reason: 'The action card is too long to review.' }
  return { outcome: 'review', reason: 'The command changes the Auto workspace.', card }
}

/**
 * Decides whether one frozen desktop action may run under Computer Use Auto.
 * The frozen application name is the positive scope. Unnamed clicks are refused.
 */
export function decideComputerUseAuto(input: ComputerUseAutoInput): AutoDecision {
  if (!input.contextAvailable)
    return { outcome: 'refuse', reason: 'Computer Use Auto cannot see the foreground window.' }
  if (!appsMatchForAuto(input.frozenAppName, input.appName))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses applications outside the frozen scope.' }
  if (isDeniedWindow(input.appName) || isDeniedWindow(input.windowTitle))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses this application.' }
  if (isTerminalWindow(input.appName) || isTerminalWindow(input.windowTitle))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses terminal windows. Use Command approval for shell commands.' }
  if (input.actionKind === 'type_text' && input.action?.input?.pressEnter === true)
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses submitted text.' }
  if (input.actionKind === 'clipboard_read_text' || input.actionKind === 'clipboard_write_text' || input.actionKind === 'secret_read_env_value' || input.actionKind.startsWith('pty_'))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses clipboard, secrets, and new terminals.' }
  if (input.actionKind === 'click')
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses coordinate clicks without a target name.' }
  if (hasScreenPoint(input) && (input.actionKind === 'scroll' || input.actionKind === 'type_text'))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses actions aimed at a screen coordinate.' }
  if (input.actionKind === 'scroll')
    return { outcome: 'refuse', reason: 'Computer Use Auto cannot pin scrolling to the frozen application.' }
  if (DESKTOP_ALLOW.has(input.actionKind))
    return { outcome: 'allow', reason: 'The desktop action does not change input.' }
  if (!DESKTOP_REVIEW.has(input.actionKind))
    return { outcome: 'refuse', reason: 'Computer Use Auto does not recognize this action.' }
  if ((input.actionKind === 'open_app' || input.actionKind === 'focus_app') && !targetsFrozenApp(input))
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses opening or focusing another application.' }

  const targetName = desktopTargetName(input)
  if (!targetName)
    return { outcome: 'refuse', reason: 'Computer Use Auto refuses actions without a target name.' }

  const card: AutoApprovalCard = {
    lane: 'computer_use',
    actionKind: input.actionKind,
    appName: input.appName ?? '',
    windowTitle: (input.windowTitle ?? '').trim(),
    reviewClass: 'desktop',
    targetName,
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
  const tokens = parseSimpleCommand(snapshot.command, snapshot.executorPlatform)
  if (!tokens || mentionsSecret(tokens) || isPrivilegeCommand(tokens))
    return false
  const name = commandName(tokens[0])
  const flagsOnly = tokens.slice(name === 'git' ? 2 : 1).every(token => token.startsWith('-') && !token.includes('='))
  if (name === 'pwd' || name === 'get-location' || name === 'ls' || name === 'get-childitem')
    return flagsOnly
  if (name === 'git') {
    const subcommand = tokens[1]?.toLowerCase()
    return subcommand !== undefined && READ_ONLY_GIT.has(subcommand) && flagsOnly && gitReadOnlyArgs(tokens)
  }
  return false
}

export function cardBytes(card: AutoApprovalCard): number {
  return new TextEncoder().encode(JSON.stringify(card)).byteLength
}

function commandReviewClass(tokens: string[]): 'delete' | 'write' | undefined {
  const name = commandName(tokens[0])
  if (REFUSE_COMMANDS.has(name))
    return undefined
  if (DELETE_COMMANDS.has(name))
    return 'delete'
  if (WRITE_COMMANDS.has(name))
    return 'write'
  if (name !== 'git')
    return undefined
  const subcommand = tokens[1]?.toLowerCase()
  if (!subcommand)
    return undefined
  if (subcommand === 'rm' || subcommand === 'mv')
    return 'delete'
  return undefined
}

function isBroadDelete(tokens: string[], workspaceRoot: string, cwd: string, platform: string): boolean {
  const name = commandName(tokens[0])
  const recursive = tokens.some(token => isRecursiveDeleteFlag(token))
  if (!recursive)
    return false
  if (!DELETE_COMMANDS.has(name) && (name !== 'git' || tokens[1]?.toLowerCase() !== 'rm'))
    return false
  const targets = tokens.filter(token => !token.startsWith('-'))
  const rootToken = targets.find((token) => {
    const resolved = resolvePathToken(token, cwd, platform)
    if (resolved === 'skip' || resolved === 'unsafe')
      return token === '.' || token === '*' || token === workspaceRoot
    return !isInsideRoot(workspaceRoot, resolved, platform) || normalizeForCompare(resolved, platform) === normalizeForCompare(pathApi(platform).resolve(workspaceRoot), platform)
  })
  return targets.some(token => token === '.' || token === '*') || Boolean(rootToken)
}

function parseSimpleCommand(command: string, platform: string): string[] | undefined {
  if (platform !== 'win32' && command.includes('\\'))
    return undefined
  if (/\bInvoke-Expression\b/i.test(command) || /\biex\b/i.test(command) || /-EncodedCommand/i.test(command) || /\bcmd(?:\.exe)?\s+\/c\b/i.test(command))
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
  return subcommand !== undefined && READ_ONLY_GIT.has(subcommand) && gitReadOnlyArgs(tokens)
}

function gitReadOnlyArgs(tokens: string[]): boolean {
  for (const token of tokens.slice(2)) {
    if (!token.startsWith('-'))
      return false
    if (token.includes('=') || token === '-c' || token.startsWith('--output') || token.startsWith('--textconv') || token.startsWith('--ext-diff'))
      return false
  }
  return true
}

function isPrivilegeCommand(tokens: string[]): boolean {
  return PRIVILEGE_COMMANDS.has(commandName(tokens[0]))
}

function mentionsSecret(tokens: readonly string[]): boolean {
  return tokens.some(token => token.split(/[\s\\/]+/).some((part) => {
    const name = part.trim().toLowerCase().replace(/^['"]+|['"]+$/g, '')
    return SECRET_NAMES.has(name) || name.startsWith('.env')
  }))
}

function commandName(token: string): string {
  return token.toLowerCase()
}

function resolvePathToken(token: string, cwd: string, platform: string, checkBareExisting = false): string | 'skip' | 'unsafe' {
  if (token === '--')
    return 'skip'
  if (token.startsWith('-')) {
    const separator = token.indexOf('=')
    if (separator === -1)
      return 'skip'
    const value = token.slice(separator + 1)
    return value ? resolvePathToken(value, cwd, platform, checkBareExisting) : 'skip'
  }
  if (token.startsWith('~') || token.startsWith('\\\\?\\'))
    return 'unsafe'
  const looksLikePath = token.startsWith('/')
    || token.startsWith('\\')
    || token.startsWith('.')
    || /^[A-Z]:[\\/]/i.test(token)
    || token.includes('\\')
    || (token.includes('/') && !token.includes('://'))
  if (!looksLikePath)
    return checkBareExisting ? resolveBareExistingToken(token, cwd, platform) : 'skip'
  const api = pathApi(platform)
  const resolved = api.isAbsolute(token) ? api.normalize(token) : api.resolve(cwd, token)
  try {
    return fs.realpathSync.native(resolved)
  }
  catch {
    return canonicalExistingAncestor(resolved, platform)
  }
}

/**
 * A missing path keeps its nearest existing ancestor.
 * That ancestor is resolved, so a symlink cannot remain inside the workspace by its lexical path.
 */
function canonicalExistingAncestor(resolved: string, platform: string): string | 'unsafe' {
  const api = pathApi(platform)
  let probe = resolved
  while (true) {
    if (existsAsPath(probe)) {
      try {
        return fs.realpathSync.native(probe)
      }
      catch {
        return 'unsafe'
      }
    }
    const parent = api.dirname(probe)
    if (parent === probe)
      return resolved
    probe = parent
  }
}

function existsAsPath(value: string): boolean {
  try {
    fs.lstatSync(value)
    return true
  }
  catch {
    return false
  }
}

function isRecursiveDeleteFlag(token: string): boolean {
  if (/^(?:--recursive|-recurse)$/i.test(token))
    return true
  return /^-[a-z]+$/i.test(token) && token.toLowerCase().includes('r')
}

function hasScreenPoint(input: ComputerUseAutoInput): boolean {
  const fields = input.action?.input ?? {}
  return typeof fields.x === 'number' || typeof fields.y === 'number'
}

function targetsFrozenApp(input: ComputerUseAutoInput): boolean {
  const app = input.action?.input?.app
  return typeof app === 'string' && appsMatchForAuto(input.frozenAppName, app)
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

function normalizeAppName(value: string): string {
  return value.trim().toLowerCase()
}

function pathApi(platform: string) {
  return platform === 'win32' ? path.win32 : path.posix
}

/** Resolves a directory to its canonical path so short and long Windows paths compare equal. */
function resolveExistingPath(value: string, platform: string): string {
  const api = pathApi(platform)
  const resolved = api.resolve(value)
  try {
    return fs.realpathSync.native(resolved)
  }
  catch {
    return resolved
  }
}

function isDeniedWindow(value: string | undefined): boolean {
  return value !== undefined && WINDOW_DENY.some(pattern => pattern.test(value))
}

function isTerminalWindow(value: string | undefined): boolean {
  return value !== undefined && TERMINAL_WINDOW.some(pattern => pattern.test(value))
}

function desktopTargetName(input: ComputerUseAutoInput): string {
  const fields = input.action?.input ?? {}
  if (input.actionKind === 'desktop_click_target')
    return input.targetLabel?.trim() ?? ''
  if (input.actionKind === 'type_text' && typeof fields.text === 'string')
    return fields.text
  if (input.actionKind === 'press_keys' && Array.isArray(fields.keys))
    return fields.keys.filter((key): key is string => typeof key === 'string').join('+')
  if ((input.actionKind === 'open_app' || input.actionKind === 'focus_app') && typeof fields.app === 'string')
    return fields.app
  if (input.actionKind.startsWith('browser_dom_') && typeof fields.selector === 'string')
    return fields.selector
  return ''
}

function desktopDetail(input: ComputerUseAutoInput): string {
  const fields = input.action?.input ?? {}
  if (input.actionKind.startsWith('browser_dom_')) {
    return mutationPayload(fields, ['tabId', 'frameIds', ...(BROWSER_MUTATION_FIELDS[input.actionKind] ?? [])])
  }
  if (input.actionKind === 'type_text' && typeof fields.text === 'string')
    return ''
  if (input.actionKind === 'press_keys' && Array.isArray(fields.keys))
    return ''
  if (input.actionKind === 'desktop_click_target')
    return input.targetLabel?.trim() ?? ''
  return ''
}

function mutationPayload(fields: Record<string, unknown>, keys: readonly string[]): string {
  const payload: Record<string, unknown> = {}
  for (const key of keys) {
    if (fields[key] !== undefined)
      payload[key] = fields[key]
  }
  return JSON.stringify(payload)
}

/** A bare token that exists under the cwd is canonicalized so a symlink cannot hide an escape. */
function resolveBareExistingToken(token: string, cwd: string, platform: string): string | 'skip' | 'unsafe' {
  if (token.includes('://'))
    return 'skip'
  const resolved = pathApi(platform).resolve(cwd, token)
  try {
    fs.lstatSync(resolved)
  }
  catch {
    return 'skip'
  }
  try {
    return fs.realpathSync.native(resolved)
  }
  catch {
    return 'unsafe'
  }
}
