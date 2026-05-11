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
  /**
   * Whether the driver should also emit key-release events.
   *
   * Drivers that cannot deliver release events refuse the registration
   * with `{ ok: false, reason: ShortcutFailureReasons.Unsupported }`. The Electron
   * `globalShortcut` driver currently refuses; a uiohook-based driver
   * path is planned to honour this flag.
   *
   * @default false
   */
  receiveKeyUps?: boolean
  /** Human-readable description, surfaced in settings UI. */
  description?: string
}

/**
 * Closed set of failure reasons returned by drivers.
 *
 * Drivers translate platform-specific failures into one of these
 * values at the boundary; raw underlying errors stay in driver logs,
 * not on the wire. Add a new value here before any driver may emit it.
 */
export const ShortcutFailureReasons = {
  /**
   * The accelerator is held by another app or by another binding here
   * under a different id.
   */
  Conflict: 'conflict',
  /**
   * An active binding already uses this id; callers must `unregister`
   * first to rebind.
   */
  DuplicateId: 'duplicate-id',
  /**
   * The OS or portal refused the registration (e.g. user declined a
   * Wayland portal dialog, macOS denied Accessibility for a media-key
   * combo). Drivers that can distinguish denial from conflict report
   * this; the Electron `globalShortcut` driver cannot distinguish and
   * reports `Conflict` for both.
   */
  Denied: 'denied',
  /**
   * The driver cannot satisfy the request (e.g. a binding asks for
   * `receiveKeyUps: true` on a driver path that only delivers
   * presses).
   */
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
