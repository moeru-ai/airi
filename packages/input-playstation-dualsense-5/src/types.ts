/** The transport that provides DualSense HID reports. */
export type DualSenseConnectionType = 'bluetooth' | 'unknown' | 'usb'

/** The lifecycle state of a {@link DualSenseController}. */
export type DualSenseControllerLifecycle = 'closed' | 'closing' | 'open' | 'opening'

/** A normalized two-dimensional stick value. Each axis is in the range from -1 to 1. */
export interface DualSenseStickState {
  readonly x: number
  readonly y: number
}

/** The state of the four directional buttons. */
export interface DualSenseDpadState {
  readonly down: boolean
  readonly left: boolean
  readonly right: boolean
  readonly up: boolean
}

/** The digital button state that does not belong to a trigger or directional pad. */
export interface DualSenseButtonState {
  readonly circle: boolean
  readonly create: boolean
  readonly l1: boolean
  readonly l3: boolean
  readonly mute: boolean
  readonly options: boolean
  readonly ps: boolean
  readonly r1: boolean
  readonly r3: boolean
  readonly square: boolean
  readonly touchpad: boolean
  readonly triangle: boolean
  readonly cross: boolean
}

/** Feedback from one adaptive trigger. */
export interface DualSenseTriggerFeedback {
  readonly active: boolean
  readonly state: number
}

/** The input state of one trigger. */
export interface DualSenseTriggerState {
  readonly pressed: boolean
  /** The normalized trigger position in the range from 0 to 1. */
  readonly value: number
  /** Bluetooth report `0x01` does not contain this value. */
  readonly feedback: DualSenseTriggerFeedback | null
}

/** One touch point from the DualSense touchpad. */
export interface DualSenseTouchPoint {
  readonly active: boolean
  readonly id: number
  readonly x: number
  readonly y: number
}

/** A signed three-dimensional sensor value from the controller. */
export interface DualSenseVector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Motion data from an extended USB or Bluetooth report. */
export interface DualSenseMotionState {
  readonly accelerometer: DualSenseVector3
  readonly gyroscope: DualSenseVector3
}

/** Battery data from an extended USB or Bluetooth report. */
export interface DualSenseBatteryState {
  readonly charging: boolean
  readonly full: boolean
  readonly levelPercent: number
}

/** The parsed state of one DualSense input report. */
export interface DualSenseInputState {
  readonly battery: DualSenseBatteryState | null
  readonly buttons: DualSenseButtonState
  readonly dpad: DualSenseDpadState
  readonly motion: DualSenseMotionState | null
  /** This raw controller counter is not a wall-clock timestamp. */
  readonly sensorTimestamp: number | null
  readonly sequenceNumber: number | null
  readonly sticks: {
    readonly left: DualSenseStickState
    readonly right: DualSenseStickState
  }
  /** This raw controller counter is not a wall-clock timestamp. */
  readonly timestamp: number | null
  readonly touchPoints: readonly [DualSenseTouchPoint, DualSenseTouchPoint] | null
  readonly triggers: {
    readonly left: DualSenseTriggerState
    readonly right: DualSenseTriggerState
  }
}

/** A parsed input report and its original bytes. */
export interface DualSenseInputReport {
  readonly connectionType: DualSenseConnectionType
  /** These bytes do not include the report ID. */
  readonly data: Uint8Array
  readonly reportId: number
  readonly state: DualSenseInputState
}

/** The eight-byte effect payload for one adaptive trigger. */
export interface DualSenseTriggerEffect {
  readonly mode: number
  readonly parameters: readonly [number, number, number, number, number, number, number]
}

/** Values for one DualSense output report. Byte values are clamped to the range from 0 to 255. */
export interface DualSenseOutputState {
  readonly leftMotor: number
  readonly leftTriggerEffect: DualSenseTriggerEffect
  readonly lightbar: {
    readonly blue: number
    readonly green: number
    readonly red: number
  }
  readonly muteLed: boolean
  /** Each item controls one of the five white player LEDs. */
  readonly playerLeds: readonly [boolean, boolean, boolean, boolean, boolean]
  readonly rightMotor: number
  readonly rightTriggerEffect: DualSenseTriggerEffect
}

/** Bytes that can be passed to `HIDDevice.sendReport()`. */
export interface DualSenseOutputReport {
  readonly data: Uint8Array<ArrayBuffer>
  readonly nextSequenceNumber: number
  readonly reportId: number
}

/** A DualSense connect or disconnect event from WebHID. */
export interface DualSenseConnectionEvent {
  readonly device: HIDDevice
  readonly type: 'connect' | 'disconnect'
}

/** Receives parsed input reports from a {@link DualSenseController}. */
export type DualSenseInputReportListener = (report: DualSenseInputReport) => void

/** Receives WebHID connection changes for standard DualSense devices. */
export type DualSenseConnectionListener = (event: DualSenseConnectionEvent) => void
