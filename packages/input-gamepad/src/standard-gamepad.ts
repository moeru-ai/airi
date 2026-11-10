import type {
  GamepadFamily,
  StandardGamepadButtonName,
  StandardGamepadButtonState,
  StandardGamepadMonitorOptions,
  StandardGamepadSnapshot,
  StandardGamepadSnapshotListener,
  StandardGamepadSnapshotOptions,
  StandardGamepadStickState,
} from './types'

const standardButtonIndices = Object.freeze({
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  dpadUp: 12,
  faceBottom: 0,
  faceLeft: 2,
  faceRight: 1,
  faceTop: 3,
  leftShoulder: 4,
  leftStick: 10,
  leftTrigger: 6,
  rightShoulder: 5,
  rightStick: 11,
  rightTrigger: 7,
  select: 8,
  start: 9,
}) satisfies Readonly<Record<StandardGamepadButtonName, number>>

const neutralButton: StandardGamepadButtonState = Object.freeze({
  pressed: false,
  touched: false,
  value: 0,
})

const familyButtonLabels: Readonly<Record<GamepadFamily, Readonly<Record<StandardGamepadButtonName, string>>>> = {
  nintendo: createButtonLabels({
    faceBottom: 'B',
    faceLeft: 'Y',
    faceRight: 'A',
    faceTop: 'X',
    leftShoulder: 'L',
    leftTrigger: 'ZL',
    rightShoulder: 'R',
    rightTrigger: 'ZR',
  }),
  playstation: createButtonLabels({
    faceBottom: '×',
    faceLeft: '□',
    faceRight: '○',
    faceTop: '△',
    leftShoulder: 'L1',
    leftTrigger: 'L2',
    rightShoulder: 'R1',
    rightTrigger: 'R2',
  }),
  unknown: createButtonLabels({}),
  xbox: createButtonLabels({
    faceBottom: 'A',
    faceLeft: 'X',
    faceRight: 'B',
    faceTop: 'Y',
    leftShoulder: 'LB',
    leftTrigger: 'LT',
    rightShoulder: 'RB',
    rightTrigger: 'RT',
  }),
}

/** Returns true when the current browser exposes the Gamepad API. */
export function isGamepadApiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
}

/**
 * Infers the printed controller family from a browser gamepad identifier.
 * The result changes labels only. It does not change standard button positions.
 *
 * @example
 * detectGamepadFamily('Xbox Wireless Controller')
 * // => 'xbox'
 */
export function detectGamepadFamily(id: string): GamepadFamily {
  const normalizedId = id.toLowerCase()
  if (normalizedId.includes('xbox') || normalizedId.includes('xinput') || normalizedId.includes('045e'))
    return 'xbox'
  if (normalizedId.includes('nintendo') || normalizedId.includes('joy-con') || normalizedId.includes('057e'))
    return 'nintendo'
  if (
    normalizedId.includes('dualsense')
    || normalizedId.includes('dualshock')
    || normalizedId.includes('playstation')
    || normalizedId.includes('wireless controller')
    || normalizedId.includes('054c')
  ) {
    return 'playstation'
  }
  return 'unknown'
}

/** Returns the printed label for one physical standard-gamepad button position. */
export function getGamepadButtonLabel(family: GamepadFamily, button: StandardGamepadButtonName): string {
  return familyButtonLabels[family][button]
}

/**
 * Normalizes a browser gamepad that uses the W3C standard mapping.
 *
 * @example
 * createStandardGamepadSnapshot(gamepad, { deadzone: 0.12 })
 * // => { leftStick: { x: 0, y: 0 }, buttons: { ... } }
 */
export function createStandardGamepadSnapshot(
  gamepad: Gamepad,
  options?: StandardGamepadSnapshotOptions,
): StandardGamepadSnapshot {
  if (gamepad.mapping !== 'standard')
    throw new Error('The gamepad does not use the standard mapping.')

  const deadzone = options?.deadzone ?? 0.12
  if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1)
    throw new Error('The gamepad deadzone must be from 0 to less than 1.')

  return {
    buttons: createButtonStates(gamepad.buttons),
    family: detectGamepadFamily(gamepad.id),
    id: gamepad.id,
    index: gamepad.index,
    leftStick: applyRadialDeadzone(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0, deadzone),
    rightStick: applyRadialDeadzone(gamepad.axes[2] ?? 0, gamepad.axes[3] ?? 0, deadzone),
    timestamp: gamepad.timestamp,
  }
}

/**
 * Polls the browser Gamepad API and keeps one standard controller selected.
 * The monitor keeps the selected index until that controller disconnects.
 */
export class StandardGamepadMonitor {
  readonly #cancelFrame: (handle: number) => void
  readonly #deadzone: number | undefined
  readonly #getGamepads: () => readonly (Gamepad | null)[]
  readonly #listeners = new Set<StandardGamepadSnapshotListener>()
  readonly #requestFrame: (callback: FrameRequestCallback) => number
  #frameHandle: number | undefined
  #latestSnapshot: StandardGamepadSnapshot | undefined
  #selectedIndex: number | undefined

  constructor(options?: StandardGamepadMonitorOptions) {
    this.#cancelFrame = options?.cancelFrame ?? (handle => cancelAnimationFrame(handle))
    this.#deadzone = options?.deadzone
    this.#getGamepads = options?.getGamepads ?? (() => {
      if (!isGamepadApiSupported())
        throw new Error('The Gamepad API is not available in this browser.')
      return navigator.getGamepads()
    })
    this.#requestFrame = options?.requestFrame ?? (callback => requestAnimationFrame(callback))
  }

  /** The latest connected snapshot. This value remains available after `stop()`. */
  get latestSnapshot(): StandardGamepadSnapshot | undefined {
    return this.#latestSnapshot
  }

  /** Returns true while the monitor owns a scheduled animation frame. */
  get running(): boolean {
    return this.#frameHandle !== undefined
  }

  /** Adds a snapshot listener and returns its cleanup function. */
  onSnapshot(listener: StandardGamepadSnapshotListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Starts polling. Repeated calls do not create duplicate loops. */
  start(): void {
    if (this.#frameHandle !== undefined)
      return
    this.#frameHandle = this.#requestFrame(this.#poll)
  }

  /** Stops polling. The latest snapshot remains available for diagnostics. */
  stop(): void {
    if (this.#frameHandle === undefined)
      return
    this.#cancelFrame(this.#frameHandle)
    this.#frameHandle = undefined
    this.#selectedIndex = undefined
  }

  readonly #poll = (): void => {
    this.#frameHandle = this.#requestFrame(this.#poll)
    const gamepads = this.#getGamepads()
    const selected = this.#findSelectedGamepad(gamepads)
    if (!selected) {
      if (this.#latestSnapshot) {
        this.#latestSnapshot = undefined
        this.#emit(undefined)
      }
      return
    }

    const snapshot = createStandardGamepadSnapshot(selected, { deadzone: this.#deadzone })
    this.#latestSnapshot = snapshot
    this.#emit(snapshot)
  }

  #emit(snapshot: StandardGamepadSnapshot | undefined): void {
    for (const listener of this.#listeners)
      listener(snapshot)
  }

  #findSelectedGamepad(gamepads: readonly (Gamepad | null)[]): Gamepad | undefined {
    if (this.#selectedIndex !== undefined) {
      const selected = gamepads.find(gamepad => gamepad?.index === this.#selectedIndex)
      if (selected?.connected && selected.mapping === 'standard')
        return selected
    }

    const next = gamepads.find(gamepad => gamepad?.connected && gamepad.mapping === 'standard') ?? undefined
    this.#selectedIndex = next?.index
    return next
  }
}

function applyRadialDeadzone(x: number, y: number, deadzone: number): StandardGamepadStickState {
  const clampedX = clampAxis(x)
  const clampedY = clampAxis(y)
  const inputMagnitude = Math.hypot(clampedX, clampedY)
  if (inputMagnitude <= deadzone)
    return { x: 0, y: 0 }

  const magnitude = Math.min(1, inputMagnitude)
  const outputMagnitude = (magnitude - deadzone) / (1 - deadzone)
  const scale = outputMagnitude / inputMagnitude
  return {
    x: clampedX * scale,
    y: clampedY * scale,
  }
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(1, Math.max(-1, value))
}

function createButtonStates(buttons: ReadonlyArray<GamepadButton>): Readonly<Record<StandardGamepadButtonName, StandardGamepadButtonState>> {
  return Object.fromEntries(
    Object.entries(standardButtonIndices).map(([name, index]) => [name, readButton(buttons[index])]),
  ) as Record<StandardGamepadButtonName, StandardGamepadButtonState>
}

function readButton(button: GamepadButton | undefined): StandardGamepadButtonState {
  if (!button)
    return neutralButton
  return {
    pressed: button.pressed,
    touched: button.touched,
    value: Math.min(1, Math.max(0, button.value)),
  }
}

function createButtonLabels(
  overrides: Partial<Record<StandardGamepadButtonName, string>>,
): Readonly<Record<StandardGamepadButtonName, string>> {
  return {
    dpadDown: 'D-pad ↓',
    dpadLeft: 'D-pad ←',
    dpadRight: 'D-pad →',
    dpadUp: 'D-pad ↑',
    faceBottom: 'Bottom',
    faceLeft: 'Left',
    faceRight: 'Right',
    faceTop: 'Top',
    leftShoulder: 'LB',
    leftStick: 'LS',
    leftTrigger: 'LT',
    rightShoulder: 'RB',
    rightStick: 'RS',
    rightTrigger: 'RT',
    select: 'Select',
    start: 'Start',
    ...overrides,
  }
}
