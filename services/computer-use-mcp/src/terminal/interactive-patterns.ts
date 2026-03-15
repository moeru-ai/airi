/**
 * Fixed interactive command/output pattern sets for terminal surface resolution.
 *
 * `auto` mode ONLY recognises these patterns — no additional heuristics.
 * To extend, add entries here and bump the test assertions.
 */

// ---------------------------------------------------------------------------
// Known interactive command patterns
// ---------------------------------------------------------------------------

/**
 * Regex patterns matching commands that are known to require an interactive
 * terminal (TUI, REPL, or interactive init wizards). Checked against the
 * first token (or first two tokens) of a trimmed command string.
 */
export const KNOWN_INTERACTIVE_COMMAND_PATTERNS: RegExp[] = [
  // Full-screen / TUI
  /^(vim|nvim|nano|less|more|man|top|htop|watch|tmux|screen)\b/,
  // REPL — bare interpreter or with -i flag
  /^node(\s+-i)?$/,
  /^(python3?|python3?\s+-i)\s*$/,
  /^(irb|rails\s+console|psql|mysql|sqlite3)\b/,
  // Interactive init wizards that prompt questions
  /^(npm|pnpm|yarn)\s+(create|init)\b/,
]

/**
 * Check whether `command` matches a known interactive command pattern.
 */
export function isKnownInteractiveCommand(command: string): boolean {
  const trimmed = command.trim()
  return KNOWN_INTERACTIVE_COMMAND_PATTERNS.some(re => re.test(trimmed))
}

// ---------------------------------------------------------------------------
// Interactive output markers
// ---------------------------------------------------------------------------

/**
 * Fixed set of output strings that indicate the process is waiting for
 * interactive input. Checked case-insensitively against stdout + stderr
 * after an exec attempt fails or times out.
 */
export const INTERACTIVE_OUTPUT_MARKERS: string[] = [
  'READY>',
  'Password:',
  'Press any key',
  'Select an option',
  'Enter your choice',
  '[y/N]',
  '[Y/n]',
]

/**
 * Returns true when `output` contains one of the fixed interactive markers.
 */
export function hasInteractiveOutputMarkers(output: string): boolean {
  const lower = output.toLowerCase()
  return INTERACTIVE_OUTPUT_MARKERS.some(marker => lower.includes(marker.toLowerCase()))
}
