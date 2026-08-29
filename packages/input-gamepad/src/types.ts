/** A controller family inferred from the browser gamepad identifier. */
export type GamepadFamily = 'nintendo' | 'playstation' | 'unknown' | 'xbox'

/** Physical button positions in the W3C standard gamepad layout. */
export const standardGamepadButtonNames = [
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'dpadUp',
  'faceBottom',
  'faceLeft',
  'faceRight',
  'faceTop',
  'leftShoulder',
  'leftStick',
  'leftTrigger',
  'rightShoulder',
  'rightStick',
  'rightTrigger',
  'select',
  'start',
] as const

/** A physical button position in the W3C standard gamepad layout. */
export type StandardGamepadButtonName = typeof standardGamepadButtonNames[number]

/** One browser button value in a standard gamepad snapshot. */
export interface StandardGamepadButtonState {
  readonly pressed: boolean
  readonly touched: boolean
  /** The analog button value in the range from 0 to 1. */
  readonly value: number
}

/** One normalized thumbstick. Both axes use the range from -1 to 1. */
export interface StandardGamepadStickState {
  readonly x: number
  /** Positive values point down, as defined by the Gamepad API. */
  readonly y: number
}

/** A normalized snapshot from a browser gamepad with the `standard` mapping. */
export interface StandardGamepadSnapshot {
  readonly buttons: Readonly<Record<StandardGamepadButtonName, StandardGamepadButtonState>>
  readonly family: GamepadFamily
  readonly id: string
  readonly index: number
  readonly leftStick: StandardGamepadStickState
  readonly rightStick: StandardGamepadStickState
  /** The browser timestamp for the source gamepad state. */
  readonly timestamp: number
}

/** Options for standard gamepad normalization. */
export interface StandardGamepadSnapshotOptions {
  /** Radial thumbstick deadzone in the range from 0 to less than 1. @default 0.12 */
  readonly deadzone?: number
}

/** Runtime dependencies and normalization settings for {@link StandardGamepadMonitor}. */
export interface StandardGamepadMonitorOptions extends StandardGamepadSnapshotOptions {
  /** Cancels one scheduled frame. @default cancelAnimationFrame */
  readonly cancelFrame?: (handle: number) => void
  /** Returns the current browser gamepad slots. @default navigator.getGamepads */
  readonly getGamepads?: () => readonly (Gamepad | null)[]
  /** Schedules the next input sample. @default requestAnimationFrame */
  readonly requestFrame?: (callback: FrameRequestCallback) => number
}

/** Receives the selected controller state, or `undefined` after it disconnects. */
export type StandardGamepadSnapshotListener = (snapshot: StandardGamepadSnapshot | undefined) => void
