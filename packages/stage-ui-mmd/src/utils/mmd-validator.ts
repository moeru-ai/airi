import type { MMDModelFormat } from './mmd-zip-loader'

import { errorMessageFrom } from '@moeru/std'
import { unzip } from 'fflate'

import { readZipEntryPaths } from './zip-entry-paths'

export type MMDValidationStatus = 'VALID' | 'INVALID'

export interface MMDValidationReport {
  status: MMDValidationStatus
  errors: string[]
  warnings: string[]
  detected: {
    modelPath?: string
    format?: MMDModelFormat
    textureCount: number
  }
}

const TEXTURE_RE = /\.(?:png|jpe?g|bmp|tga|gif|dds|spa|sph|webp)$/i

/**
 * Inspects an MMD ZIP without decoding textures into GPU memory.
 *
 * Mirrors the Live2D/Spine validator return shape so the model-selector
 * dialog can present consistent error/warning UX across formats.
 */
export async function validateMMDZip(file: File): Promise<MMDValidationReport> {
  const errors: string[] = []
  const warnings: string[] = []
  const detected: MMDValidationReport['detected'] = { textureCount: 0 }

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const decodedPaths = readZipEntryPaths(data)
    let entryIndex = 0
    const files = await new Promise<string[]>((resolve, reject) => {
      const paths: string[] = []
      unzip(data, {
        filter: (entry) => {
          const path = decodedPaths[entryIndex++] ?? entry.name
          const isFile = !path.endsWith('/') && !path.endsWith('\\')
          // fflate's archive API can only extract stored and standard Deflate entries.
          if (isFile && entry.compression !== 0 && entry.compression !== 8)
            throw new Error(`Unsupported ZIP compression method: ${entry.compression}`)
          if (isFile)
            paths.push(path)
          // Validation only needs entry names, so skip decompressing model and texture payloads.
          return false
        },
      }, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(paths)
      })
    })

    const pmx = files.filter(name => name.toLowerCase().endsWith('.pmx'))
    const pmd = files.filter(name => name.toLowerCase().endsWith('.pmd'))

    if (pmx.length === 0 && pmd.length === 0) {
      errors.push('No model (`.pmx` or `.pmd`) found in the ZIP.')
      return { status: 'INVALID', errors, warnings, detected }
    }

    if (pmx.length + pmd.length > 1)
      warnings.push(`Multiple model files detected (${pmx.length + pmd.length}). The import will use the first one.`)

    if (pmx.length > 0) {
      detected.modelPath = pmx[0]
      detected.format = 'pmx'
    }
    else {
      detected.modelPath = pmd[0]
      detected.format = 'pmd'
    }

    const textures = files.filter(name => TEXTURE_RE.test(name))
    detected.textureCount = textures.length
    if (textures.length === 0)
      warnings.push('No texture files detected. The model may render untextured.')
  }
  catch (err) {
    errors.push(`Failed to read ZIP: ${errorMessageFrom(err) ?? 'Unknown error'}`)
    return { status: 'INVALID', errors, warnings, detected }
  }

  return { status: 'VALID', errors, warnings, detected }
}
