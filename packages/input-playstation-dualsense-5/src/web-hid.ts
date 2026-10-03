import type {
  DualSenseConnectionListener,
  DualSenseConnectionType,
} from './types'

/** Sony's USB vendor ID. */
export const dualSenseVendorId = 0x054C

/** The product ID of the standard PlayStation 5 DualSense controller. */
export const dualSenseProductId = 0x0CE6

const genericDesktopUsagePage = 0x0001
const gamepadUsage = 0x0005

/** Returns true when the current browser exposes WebHID. */
export function isWebHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator
}

/** Returns true when a WebHID device is a standard PlayStation 5 DualSense controller. */
export function isDualSenseDevice(device: Pick<HIDDevice, 'productId' | 'vendorId'>): boolean {
  return device.vendorId === dualSenseVendorId && device.productId === dualSenseProductId
}

/**
 * Detects the DualSense transport from its generic gamepad collection.
 * WebHID does not provide the USB or Bluetooth transport directly.
 */
export function detectDualSenseConnectionType(
  device: Pick<HIDDevice, 'collections'>,
): DualSenseConnectionType {
  for (const collection of device.collections) {
    if (collection.usagePage !== genericDesktopUsagePage || collection.usage !== gamepadUsage)
      continue

    const maximumInputReportBits = getMaximumInputReportBits(collection)
    if (maximumInputReportBits === 504)
      return 'usb'
    if (maximumInputReportBits === 616)
      return 'bluetooth'
  }

  return 'unknown'
}

/**
 * Opens the WebHID device chooser for a standard DualSense controller.
 * Call this function from a user action.
 */
export async function requestDualSenseDevice(hid?: HID): Promise<HIDDevice | undefined> {
  const devices = await resolveWebHid(hid).requestDevice({
    filters: [createDualSenseDeviceFilter()],
  })
  return devices.find(isDualSenseDevice)
}

/** Returns the permitted standard DualSense devices that are currently known to WebHID. */
export async function getGrantedDualSenseDevices(hid?: HID): Promise<HIDDevice[]> {
  const devices = await resolveWebHid(hid).getDevices()
  return devices.filter(isDualSenseDevice)
}

/** Observes WebHID connect and disconnect events for standard DualSense devices. */
export function onDualSenseConnectionChange(
  listener: DualSenseConnectionListener,
  hid?: HID,
): () => void {
  const webHid = resolveWebHid(hid)
  const handleConnect = (event: HIDConnectionEvent) => {
    if (isDualSenseDevice(event.device))
      listener({ device: event.device, type: 'connect' })
  }
  const handleDisconnect = (event: HIDConnectionEvent) => {
    if (isDualSenseDevice(event.device))
      listener({ device: event.device, type: 'disconnect' })
  }

  webHid.addEventListener('connect', handleConnect)
  webHid.addEventListener('disconnect', handleDisconnect)
  return () => {
    webHid.removeEventListener('connect', handleConnect)
    webHid.removeEventListener('disconnect', handleDisconnect)
  }
}

function createDualSenseDeviceFilter(): HIDDeviceFilter {
  return {
    productId: dualSenseProductId,
    usage: gamepadUsage,
    usagePage: genericDesktopUsagePage,
    vendorId: dualSenseVendorId,
  }
}

function getMaximumInputReportBits(collection: HIDCollectionInfo): number {
  const inputReports = collection.inputReports
  if (!inputReports)
    return 0

  let maximumBits = 0
  for (const report of inputReports) {
    const items = report.items
    if (!items)
      continue

    let reportBits = 0
    for (const item of items) {
      if (item.reportSize === undefined || item.reportCount === undefined)
        continue
      reportBits += item.reportSize * item.reportCount
    }
    maximumBits = Math.max(maximumBits, reportBits)
  }
  return maximumBits
}

function resolveWebHid(hid: HID | undefined): HID {
  if (hid)
    return hid
  if (!isWebHidSupported())
    throw new Error('WebHID is not available in this browser.')
  return navigator.hid
}
