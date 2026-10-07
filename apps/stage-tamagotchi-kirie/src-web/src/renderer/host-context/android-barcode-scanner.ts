import type { AiriAndroidBarcodeScanResult } from '../../shared/eventa'

import { airiAndroidBarcodeEventIds } from '../../shared/eventa'
import { invokeAndroidEventa } from './android-permissions'

export async function scanAndroidBarcode(scanInstructions: string) {
  const result = await invokeAndroidEventa<AiriAndroidBarcodeScanResult>(
    airiAndroidBarcodeEventIds.scan,
    { scanInstructions },
  )

  if (result.error)
    throw new Error(result.error)
  if (!result.ScanResult)
    throw new Error('The barcode scanner returned no result')

  return result.ScanResult
}
