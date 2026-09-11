import type {
  DualSenseButtonState,
  DualSenseConnectionType,
  DualSenseDpadState,
  DualSenseInputReport,
  DualSenseInputState,
  DualSenseTouchPoint,
  DualSenseTriggerFeedback,
} from './types'

const usbInputReport01Size = 63
const bluetoothInputReport01Size = 9
const bluetoothInputReport31Size = 77

interface ExtendedInputOffsets {
  accelerometer: number
  axes: number
  battery: number
  buttons: number
  feedback: number
  gyroscope: number
  sensorTimestamp: number | null
  sequenceNumber: number | null
  timestamp: number
  touchPoints: number
}

/**
 * Parses one WebHID input report from a standard DualSense controller.
 * The function returns `undefined` when the report ID or byte length is not supported.
 *
 * @example
 * const state = parseDualSenseInputReport('bluetooth', 0x01, reportData)
 * // => { reportId: 1, state: { sticks: { ... } }, ... }
 */
export function parseDualSenseInputReport(
  connectionType: DualSenseConnectionType,
  reportId: number,
  reportData: DataView,
): DualSenseInputReport | undefined {
  let state: DualSenseInputState | undefined

  if (connectionType === 'usb' && reportId === 0x01 && reportData.byteLength === usbInputReport01Size) {
    state = parseExtendedInputReport(reportData, {
      accelerometer: 21,
      axes: 0,
      battery: 52,
      buttons: 7,
      feedback: 41,
      gyroscope: 15,
      sensorTimestamp: 27,
      sequenceNumber: 6,
      timestamp: 11,
      touchPoints: 32,
    })
  }
  else if (connectionType === 'bluetooth' && reportId === 0x01 && reportData.byteLength === bluetoothInputReport01Size) {
    state = parseCompactBluetoothInputReport(reportData)
  }
  else if (connectionType === 'bluetooth' && reportId === 0x31 && reportData.byteLength === bluetoothInputReport31Size) {
    state = parseExtendedInputReport(reportData, {
      accelerometer: 22,
      axes: 1,
      battery: 53,
      buttons: 8,
      feedback: 42,
      gyroscope: 16,
      sensorTimestamp: null,
      sequenceNumber: null,
      timestamp: 12,
      touchPoints: 33,
    })
  }

  if (!state)
    return undefined

  const data = new Uint8Array(reportData.buffer, reportData.byteOffset, reportData.byteLength).slice()
  return { connectionType, data, reportId, state }
}

function parseCompactBluetoothInputReport(report: DataView): DualSenseInputState {
  const buttons0 = report.getUint8(4)
  const buttons1 = report.getUint8(5)
  const buttons2 = report.getUint8(6)

  return {
    battery: null,
    buttons: parseButtons(buttons0, buttons1, buttons2, false),
    dpad: parseDpad(buttons0),
    motion: null,
    sensorTimestamp: null,
    sequenceNumber: null,
    sticks: parseSticks(report, 0),
    timestamp: null,
    touchPoints: null,
    triggers: {
      left: {
        feedback: null,
        pressed: hasBit(buttons1, 2),
        value: normalizeTriggerAxis(report.getUint8(7)),
      },
      right: {
        feedback: null,
        pressed: hasBit(buttons1, 3),
        value: normalizeTriggerAxis(report.getUint8(8)),
      },
    },
  }
}

function parseExtendedInputReport(report: DataView, offsets: ExtendedInputOffsets): DualSenseInputState {
  const buttons0 = report.getUint8(offsets.buttons)
  const buttons1 = report.getUint8(offsets.buttons + 1)
  const buttons2 = report.getUint8(offsets.buttons + 2)
  const rightFeedback = report.getUint8(offsets.feedback)
  const leftFeedback = report.getUint8(offsets.feedback + 1)
  const battery0 = report.getUint8(offsets.battery)
  const battery1 = report.getUint8(offsets.battery + 1)

  return {
    battery: {
      charging: hasBit(battery1, 3),
      full: hasBit(battery0, 5),
      levelPercent: Math.min(100, (battery0 & 0x0F) * 100 / 8),
    },
    buttons: parseButtons(buttons0, buttons1, buttons2, true),
    dpad: parseDpad(buttons0),
    motion: {
      accelerometer: parseVector3(report, offsets.accelerometer),
      gyroscope: parseVector3(report, offsets.gyroscope),
    },
    sensorTimestamp: offsets.sensorTimestamp === null
      ? null
      : report.getUint32(offsets.sensorTimestamp, true),
    sequenceNumber: offsets.sequenceNumber === null
      ? null
      : report.getUint8(offsets.sequenceNumber),
    sticks: parseSticks(report, offsets.axes),
    timestamp: report.getUint32(offsets.timestamp, true),
    touchPoints: [
      parseTouchPoint(report, offsets.touchPoints),
      parseTouchPoint(report, offsets.touchPoints + 4),
    ],
    triggers: {
      left: {
        feedback: parseTriggerFeedback(leftFeedback),
        pressed: hasBit(buttons1, 2),
        value: normalizeTriggerAxis(report.getUint8(offsets.axes + 4)),
      },
      right: {
        feedback: parseTriggerFeedback(rightFeedback),
        pressed: hasBit(buttons1, 3),
        value: normalizeTriggerAxis(report.getUint8(offsets.axes + 5)),
      },
    },
  }
}

function parseButtons(
  buttons0: number,
  buttons1: number,
  buttons2: number,
  hasMuteButton: boolean,
): DualSenseButtonState {
  return {
    circle: hasBit(buttons0, 6),
    create: hasBit(buttons1, 4),
    cross: hasBit(buttons0, 5),
    l1: hasBit(buttons1, 0),
    l3: hasBit(buttons1, 6),
    mute: hasMuteButton && hasBit(buttons2, 2),
    options: hasBit(buttons1, 5),
    ps: hasBit(buttons2, 0),
    r1: hasBit(buttons1, 1),
    r3: hasBit(buttons1, 7),
    square: hasBit(buttons0, 4),
    touchpad: hasBit(buttons2, 1),
    triangle: hasBit(buttons0, 7),
  }
}

function parseDpad(buttons0: number): DualSenseDpadState {
  const direction = buttons0 & 0x0F
  return {
    down: direction === 3 || direction === 4 || direction === 5,
    left: direction === 5 || direction === 6 || direction === 7,
    right: direction === 1 || direction === 2 || direction === 3,
    up: direction === 0 || direction === 1 || direction === 7,
  }
}

function parseSticks(report: DataView, offset: number): DualSenseInputState['sticks'] {
  return {
    left: {
      x: normalizeThumbStickAxis(report.getUint8(offset)),
      y: normalizeThumbStickAxis(report.getUint8(offset + 1)),
    },
    right: {
      x: normalizeThumbStickAxis(report.getUint8(offset + 2)),
      y: normalizeThumbStickAxis(report.getUint8(offset + 3)),
    },
  }
}

function parseVector3(report: DataView, offset: number) {
  return {
    x: report.getInt16(offset, true),
    y: report.getInt16(offset + 2, true),
    z: report.getInt16(offset + 4, true),
  }
}

function parseTouchPoint(report: DataView, offset: number): DualSenseTouchPoint {
  const byte0 = report.getUint8(offset)
  const byte1 = report.getUint8(offset + 1)
  const byte2 = report.getUint8(offset + 2)
  const byte3 = report.getUint8(offset + 3)
  return {
    active: (byte0 & 0x80) === 0,
    id: byte0 & 0x7F,
    x: ((byte2 & 0x0F) << 8) | byte1,
    y: (byte3 << 4) | ((byte2 & 0xF0) >> 4),
  }
}

function parseTriggerFeedback(value: number): DualSenseTriggerFeedback {
  return {
    active: (value & 0x10) !== 0,
    state: value & 0x0F,
  }
}

function normalizeThumbStickAxis(value: number): number {
  return (2 * value / 0xFF) - 1
}

function normalizeTriggerAxis(value: number): number {
  return value / 0xFF
}

function hasBit(value: number, bit: number): boolean {
  return (value & (1 << bit)) !== 0
}
