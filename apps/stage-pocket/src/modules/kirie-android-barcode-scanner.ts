import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { getKirieAndroidEventaContext } from './kirie-android-eventa'

interface BarcodeScanPayload {
  scanInstructions: string
}

interface BarcodeScanResult {
  ScanResult?: string
  error?: string
  format?: number
}

const scanBarcodeEvent = defineInvokeEventa<BarcodeScanResult, BarcodeScanPayload>(
  'eventa:invoke:airi:android:barcode:scan',
)

export async function scanKirieAndroidQrCode(scanInstructions: string) {
  const result = await defineInvoke(getKirieAndroidEventaContext(), scanBarcodeEvent)({
    scanInstructions,
  })

  if (result.error)
    throw new Error(result.error)
  if (!result.ScanResult)
    throw new Error('Error while trying to scan code.')

  return result.ScanResult
}
