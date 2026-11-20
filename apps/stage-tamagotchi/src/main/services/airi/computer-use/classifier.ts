/**
 * Pure function classifier for AUV CLI commands admitted by AIRI Host.
 * Categorizes commands as 'read_only', 'mutating', or 'unknown' (fail-closed).
 */

export type AuvCommandCategory = 'read_only' | 'mutating' | 'unknown'

export interface AuvCommandClassification {
  /** Permission category: read_only (safe observation), mutating (desktop state change), or unknown (rejected) */
  category: AuvCommandCategory
  /** Normalized command name (e.g. 'window.list', 'input.clickPoint'), if resolved */
  command?: string
  /** Whether the invocation asks for help/documentation rather than executing the command */
  isHelp: boolean
  /** Human-readable explanation of the classification decision */
  reason: string
}

/**
 * Commands that strictly read, capture, or observe desktop state without mutating,
 * admitted by the AIRI desktop computer-use runtime.
 */
export const READ_ONLY_COMMANDS = new Set<string>([
  'display.capture',
  'display.captureRegion',
  'display.findText',
  'display.list',
  'display.waitForText',
  'window.list',
  'window.capture',
  'window.findText',
  'window.waitForText',
  'input.pointerPosition',
  'permission.probe',
  'media.getNowPlaying',
])

/**
 * Commands that inject user input, alter window state/focus, or control media playback,
 * admitted by the AIRI desktop computer-use runtime. Requires explicit authorization.
 */
export const MUTATING_COMMANDS = new Set<string>([
  'screen.clickText',
  'window.clickText',
  'input.focusText',
  'input.axFocusText',
  'input.typeText',
  'input.pasteText',
  'input.key',
  'input.keys',
  'input.pressKeys',
  'input.holdKeys',
  'input.keyboard',
  'input.moveMouse',
  'input.scrollPoint',
  'input.clickPoint',
  'input.drag',
  'input.scroll',
  'input.scrollUntil',
  'app.activate',
  'mediaControl.play',
  'mediaControl.pause',
  'mediaControl.togglePlayPause',
  'mediaControl.next',
  'mediaControl.previous',
])

/**
 * Commands that exist in AUV CLI (e.g. test fixture tools or visual debug overlays)
 * but are NOT admitted or exposed by the AIRI host runtime.
 * Explicitly cataloged to unify admission boundaries and prevent drift.
 */
export const UNADMITTED_COMMANDS = new Set<string>([
  'scan.frame',
  'scan.coverage',
  'overlay.outline',
  'overlay.cursor',
  'overlay.status',
  'overlay.captureFrame',
  'overlay.clickTarget',
])

/**
 * Flags managed exclusively by the AIRI host runtime.
 * Any attempt by a caller to pass these flags must be rejected to prevent route/store bypasses.
 */
export const MANAGED_FLAGS = [
  '--credential-stdin',
  '--store-root',
  '--endpoint',
  '--device',
  '--device-id',
  '--run',
  '--config',
  '--profile',
  '--discovery-file',
  '--pairing-store',
] as const

/**
 * Checks whether an argument token is an exact help flag before any positional delimiter ('--').
 */
function hasHelpFlag(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === '--') {
      // Anything after '--' is a positional parameter, not a flag
      break
    }
    if (arg === '--help' || arg === '-h') {
      return true
    }
  }
  return false
}

/**
 * Classifies an AUV CLI invocation into 'read_only', 'mutating', or 'unknown'.
 *
 * Security principles:
 * 1. Fail-closed: Anything unrecognized, unadmitted, or malformed is classified as 'unknown'.
 * 2. Concrete matching: Subcommands are checked against explicit allowlists, never by broad prefix.
 * 3. Semantic awareness: Full argv is checked for delimiter boundaries, help flags, and managed flags.
 * 4. Pure function: Contains no state, side-effects, or external dependencies.
 */
export function classifyAuvCommand(argv: unknown): AuvCommandClassification {
  if (!Array.isArray(argv) || argv.length === 0) {
    return {
      category: 'unknown',
      isHelp: false,
      reason: 'argv must be a non-empty array of strings',
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (typeof item !== 'string' || item.length === 0 || item.includes('\0')) {
      return {
        category: 'unknown',
        isHelp: false,
        reason: `argv item at index ${i} is invalid (must be a non-empty string without null bytes)`,
      }
    }
  }

  const args = argv as string[]
  const root = args[0]

  // Root help invocations
  if (root === '--help' || root === '-h' || root === 'help') {
    return {
      category: 'read_only',
      isHelp: true,
      reason: 'Root help invocation',
    }
  }

  if (root !== 'invoke') {
    return {
      category: 'unknown',
      isHelp: false,
      reason: `Expected 'invoke' as first argument, received '${root}'`,
    }
  }

  // Bare 'invoke' prints invoke usage
  if (args.length === 1) {
    return {
      category: 'read_only',
      isHelp: true,
      reason: 'Bare invoke invocation prints usage information',
    }
  }

  const sub = args[1]

  // Direct invoke help calls
  if (sub === '--help' || sub === '-h' || sub === 'help') {
    // If 'invoke help <command>' syntax is used
    if (sub === 'help' && args.length > 2) {
      const target = args[2]
      if (READ_ONLY_COMMANDS.has(target) || MUTATING_COMMANDS.has(target)) {
        return {
          category: 'read_only',
          command: target,
          isHelp: true,
          reason: `Help invocation for command '${target}'`,
        }
      }
      if (UNADMITTED_COMMANDS.has(target)) {
        return {
          category: 'unknown',
          command: target,
          isHelp: true,
          reason: `Command '${target}' is not admitted or supported by AIRI host`,
        }
      }
      return {
        category: 'unknown',
        command: target,
        isHelp: true,
        reason: `Unknown command '${target}' for help query`,
      }
    }
    return {
      category: 'read_only',
      isHelp: true,
      reason: 'Invoke help invocation',
    }
  }

  // Explicitly reject commands not admitted by the AIRI host
  if (UNADMITTED_COMMANDS.has(sub)) {
    return {
      category: 'unknown',
      command: sub,
      isHelp: hasHelpFlag(args.slice(2)),
      reason: `AUV command '${sub}' is not admitted or supported by AIRI host`,
    }
  }

  // Check if subcommand is recognized and admitted
  const isReadOnly = READ_ONLY_COMMANDS.has(sub)
  const isMutating = MUTATING_COMMANDS.has(sub)

  if (!isReadOnly && !isMutating) {
    return {
      category: 'unknown',
      command: sub,
      isHelp: hasHelpFlag(args.slice(2)),
      reason: `Unrecognized AUV command '${sub}'`,
    }
  }

  // Reject caller attempts to pass host-managed flags
  const remainingArgs = args.slice(2)
  for (const arg of remainingArgs) {
    if (MANAGED_FLAGS.some(flag => arg === flag || arg.startsWith(`${flag}=`))) {
      return {
        category: 'unknown',
        command: sub,
        isHelp: false,
        reason: `Command contains forbidden host-managed flag '${arg}'`,
      }
    }
  }

  // Subcommand help flag (e.g. ['invoke', 'input.clickPoint', '--help'])
  if (hasHelpFlag(remainingArgs)) {
    return {
      category: 'read_only',
      command: sub,
      isHelp: true,
      reason: `Help documentation request for '${sub}'`,
    }
  }

  if (isReadOnly) {
    return {
      category: 'read_only',
      command: sub,
      isHelp: false,
      reason: `Read-only desktop observation command '${sub}'`,
    }
  }

  return {
    category: 'mutating',
    command: sub,
    isHelp: false,
    reason: `Mutating desktop command '${sub}'`,
  }
}
