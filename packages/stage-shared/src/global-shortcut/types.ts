/**
 * A keyboard combination: modifiers plus a single key.
 *
 * Compare two accelerators structurally; modifier array order is not
 * significant. Use `formatAccelerator` for a stable canonical string.
 */
export interface ShortcutAccelerator {
  key: ShortcutKey
  modifiers: ShortcutModifier[]
}

/**
 * A registered shortcut entry.
 *
 * `id` is the stable handle used by (un)registration, and trigger
 * events; rebinding the accelerator must not change it.
 */
export interface ShortcutBinding {
  /** Keyboard combination that triggers this shortcut. */
  accelerator: ShortcutAccelerator
  /** Human-readable description, surfaced in settings UI. */
  description?: string
  /** Stable identifier, e.g. `"toggle-main-window"`. */
  id: string
  /**
   * Whether the driver should also emit key-release events.
   *
   * Routes the binding through the uiohook driver, which delivers
   * both `down` and `up` phases. Required for push-to-talk and any
   * hold-driven flow. Drivers that genuinely cannot deliver release
   * events under the current session (e.g. native Wayland for the
   * uiohook path) refuse with `{ ok: false, reason: ShortcutFailureReasons.Unsupported }`;
   * macOS without Accessibility permission refuses with `Denied`.
   *
   * @default false
   */
  receiveKeyUps?: boolean
  /** When the shortcut is active. */
  scope: ShortcutScope
}

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
  = | 'alt'
    | 'cmd'
    | 'cmd-or-ctrl'
    | 'ctrl'
    | 'shift'
    | 'super'

/**
 * When a shortcut is active.
 *
 * - `'global'` — fires regardless of which app or window is focused.
 * - (More will be added if needed)
 */
export type ShortcutScope = 'global'

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
   * The OS or portal refused the registration (e.g. user declined a
   * Wayland portal dialog, macOS denied Accessibility for a media-key
   * combo). Drivers that can distinguish denial from conflict report
   * this; the Electron `globalShortcut` driver cannot distinguish and
   * reports `Conflict` for both.
   */
  Denied: 'denied',
  /**
   * An active binding already uses this id; callers must `unregister`
   * first to rebind.
   */
  DuplicateId: 'duplicate-id',
  /** The requested binding is well-formed but unsafe or not accepted by policy. */
  Invalid: 'invalid',
  /**
   * The driver cannot satisfy the request (e.g. a binding asks for
   * `receiveKeyUps: true` on a driver path that only delivers
   * presses).
   */
  Unsupported: 'unsupported',
} as const

/**
 * In-memory shortcut config. Bump `version` on any breaking schema
 * change; consumers refuse newer versions rather than silently
 * dropping fields.
 */
export interface ShortcutConfig {
  bindings: ShortcutBinding[]
  version: 1
}

export type ShortcutFailureReason = typeof ShortcutFailureReasons[keyof typeof ShortcutFailureReasons]

/**
 * Outcome of a registration request.
 *
 * `ok: true` means the binding is live. `ok: false` carries `reason`.
 * `actualAccelerator` is populated when the host had to substitute the
 * requested accelerator (e.g. user choice via a Wayland portal dialog).
 */
export type ShortcutRegistrationResult
  = ({ actualAccelerator?: ShortcutAccelerator, ok: true }
    | { ok: false, reason: ShortcutFailureReason })
  & { id: string }
