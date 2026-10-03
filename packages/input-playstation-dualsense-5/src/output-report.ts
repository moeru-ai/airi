import type {
  DualSenseConnectionType,
  DualSenseOutputReport,
  DualSenseOutputState,
  DualSenseTriggerEffect,
} from './types'

/**
 * Creates the initial output state used by the DualSense Explorer protocol.
 *
 * @example
 * createDefaultDualSenseOutputState()
 * // => { lightbar: { red: 255, green: 255, blue: 255 }, ... }
 */
export function createDefaultDualSenseOutputState(): DualSenseOutputState {
  return {
    leftMotor: 0,
    leftTriggerEffect: createDefaultTriggerEffect(),
    lightbar: { blue: 0xFF, green: 0xFF, red: 0xFF },
    muteLed: false,
    playerLeds: [false, false, false, false, false],
    rightMotor: 0,
    rightTriggerEffect: createDefaultTriggerEffect(),
  }
}

/**
 * Builds one USB or Bluetooth DualSense output report.
 * The sequence number is used only by Bluetooth reports.
 */
export function buildDualSenseOutputReport(
  connectionType: DualSenseConnectionType,
  output: DualSenseOutputState,
  sequenceNumber = 1,
): DualSenseOutputReport {
  if (connectionType === 'unknown')
    throw new Error('The DualSense connection type is unknown.')

  const reportId = connectionType === 'bluetooth' ? 0x31 : 0x02
  const data = new Uint8Array(connectionType === 'bluetooth' ? 77 : 47)
  const commonOffset = connectionType === 'bluetooth' ? 2 : 0
  const common = new DataView(data.buffer, commonOffset, 47)

  if (connectionType === 'bluetooth') {
    data[0] = (sequenceNumber & 0x0F) << 4
    data[1] = 0x10
  }

  common.setUint8(0, 0xFF)
  common.setUint8(1, 0xF7)
  common.setUint8(2, toByte(output.rightMotor))
  common.setUint8(3, toByte(output.leftMotor))
  common.setUint8(8, output.muteLed ? 0x01 : 0x00)
  common.setUint8(9, output.muteLed ? 0x00 : 0x10)
  writeTriggerEffect(common, 10, output.rightTriggerEffect)
  writeTriggerEffect(common, 21, output.leftTriggerEffect)
  common.setUint8(39, 0x02)
  common.setUint8(41, 0x02)
  common.setUint8(43, createPlayerLedMask(output.playerLeds))
  common.setUint8(44, toByte(output.lightbar.red))
  common.setUint8(45, toByte(output.lightbar.green))
  common.setUint8(46, toByte(output.lightbar.blue))

  if (connectionType === 'bluetooth')
    fillBluetoothChecksum(reportId, data)

  return {
    data,
    nextSequenceNumber: connectionType === 'bluetooth' ? (sequenceNumber + 1) & 0x0F : sequenceNumber,
    reportId,
  }
}

function createDefaultTriggerEffect(): DualSenseTriggerEffect {
  return {
    mode: 0x26,
    parameters: [0x90, 0xA0, 0xFF, 0x00, 0x00, 0x00, 0x00],
  }
}

function writeTriggerEffect(view: DataView, offset: number, effect: DualSenseTriggerEffect): void {
  view.setUint8(offset, toByte(effect.mode))
  effect.parameters.forEach((parameter, index) => view.setUint8(offset + index + 1, toByte(parameter)))
}

function createPlayerLedMask(playerLeds: DualSenseOutputState['playerLeds']): number {
  return playerLeds.reduce((mask, enabled, index) => enabled ? mask | (1 << index) : mask, 0)
}

function fillBluetoothChecksum(reportId: number, data: Uint8Array): void {
  const checksum = crc32([0xA2, reportId], new DataView(data.buffer, 0, data.byteLength - 4))
  data[data.byteLength - 4] = checksum & 0xFF
  data[data.byteLength - 3] = (checksum >>> 8) & 0xFF
  data[data.byteLength - 2] = (checksum >>> 16) & 0xFF
  data[data.byteLength - 1] = (checksum >>> 24) & 0xFF
}

function crc32(prefixBytes: readonly number[], data: DataView): number {
  let crc = -1 >>> 0
  for (const byte of prefixBytes)
    crc = updateCrc32(crc, byte)
  for (let index = 0; index < data.byteLength; index++)
    crc = updateCrc32(crc, data.getUint8(index))
  return (crc ^ -1) >>> 0
}

function updateCrc32(crc: number, byte: number): number {
  let value = (crc ^ byte) & 0xFF
  for (let index = 0; index < 8; index++)
    value = (value & 1) !== 0 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
  return (crc >>> 8) ^ value
}

function toByte(value: number): number {
  return Math.min(0xFF, Math.max(0, Math.round(value)))
}
