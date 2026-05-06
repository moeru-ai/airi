import type { ConverterBackend } from './converter.interface'

import { ConverterBackendId } from '../../constants/model-backends'
import { RvcAdapter } from './rvc.adapter'
import { SeedVcAdapter } from './seed-vc.adapter'

/**
 * Factory: creates the appropriate converter backend based on request mode.
 */
export function createConverter(backend: ConverterBackendId): ConverterBackend {
  switch (backend) {
    case ConverterBackendId.RVC:
      return new RvcAdapter()
    case ConverterBackendId.SeedVC:
      return new SeedVcAdapter()
    default:
      throw new Error(`Unknown converter backend: ${String(backend)}`)
  }
}
