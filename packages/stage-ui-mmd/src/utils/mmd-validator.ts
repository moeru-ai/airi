import type { MMDModelFormat } from './mmd-zip-loader'

import JSZip from 'jszip'

import { errorMessageFrom } from '@moeru/std'

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
    const zip = new JSZip()
    const archive = await zip.loadAsync(file)
    const files = Object.keys(archive.files).filter(name => !archive.files[name].dir)

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
