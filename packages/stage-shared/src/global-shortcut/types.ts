/**
 * Modifier key understood by accelerator parsing and serialization.
 *
 * - `cmd-or-ctrl` — platform meta key. Resolves to Cmd on macOS,
 *   Ctrl on Windows/Linux at the driver boundary.
 * - `cmd`         — literal Command key.
 * - `ctrl`        — literal Control key.
 * - `alt`         — Alt / Option.
 * - `shift`       — Shift.
 * - `super`       — Super / Win / Meta key.
 */
export type ShortcutModifier
  = | 'cmd-or-ctrl'
    | 'cmd'
    | 'ctrl'
    | 'alt'
    | 'shift'
    | 'super'

/**
 * Key identifier following the W3C `KeyboardEvent.code` convention.
 * Layout-independent; refers to physical key position.
 *
 * Examples: `"KeyK"`, `"Digit1"`, `"F12"`, `"ArrowUp"`, `"Space"`,
 * `"Escape"`. The accepted set is enumerated by `KEY_NAMES` in
 * `./accelerators`.
 */
export type ShortcutKey = string

/**
 * A keyboard combination: modifiers plus a single key.
 *
 * Compare two accelerators structurally; modifier array order is not
 * significant. Use `formatAccelerator` for a stable canonical string.
 */
export interface ShortcutAccelerator {
  modifiers: ShortcutModifier[]
  key: ShortcutKey
}

/**
 * When a shortcut is active.
 *
 * - `'global'` — fires regardless of which app or window is focused.
 * - (More will be added if needed)
 */
export type ShortcutScope = 'global'

/**
 * A registered shortcut entry.
 *
 * `id` is the stable handle used by (un)registration, and trigger
 * events; rebinding the accelerator must not change it.
 */
export interface ShortcutBinding {
  /** Stable identifier, e.g. `"toggle-main-window"`. */
  id: string
  /** Keyboard combination that triggers this shortcut. */
  accelerator: ShortcutAccelerator
  /** When the shortcut is active. */
  scope: ShortcutScope
  /** Whether the driver should also emit key-release events. */
  receiveKeyUps?: boolean
  /** Human-readable description, surfaced in settings UI. */
  description?: string
}

export const ShortcutFailureReasons = {
  Conflict: 'conflict',
  DuplicateId: 'duplicate-id',
  Unsupported: 'unsupported',
} as const

export type ShortcutFailureReason = typeof ShortcutFailureReasons[keyof typeof ShortcutFailureReasons]

/**
 * Outcome of a registration request.
 *
 * `ok: true` means the binding is live. `ok: false` carries `reason`.
 * `actualAccelerator` is populated when the host had to substitute the
 * requested accelerator (e.g. user choice via a Wayland portal dialog).
 */
export type ShortcutRegistrationResult
  = { id: string }
    & ({ ok: true, actualAccelerator?: ShortcutAccelerator }
      | { ok: false, reason: ShortcutFailureReason })

/**
 * In-memory shortcut config. Bump `version` on any breaking schema
 * change; consumers refuse newer versions rather than silently
 * dropping fields.
 */
export interface ShortcutConfig {
  version: 1
  bindings: ShortcutBinding[]
}
