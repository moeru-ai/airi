import JSZip from 'jszip'

import { errorMessageFrom } from '@moeru/std'

export type SpineValidationStatus = 'VALID' | 'INVALID'

export interface SpineValidationReport {
  status: SpineValidationStatus
  errors: string[]
  warnings: string[]
  detected: {
    skeletonPath?: string
    skeletonFormat?: 'binary' | 'json'
    atlasPath?: string
    texturePaths: string[]
  }
}

/**
 * Inspects a Spine ZIP without loading textures into GPU memory.
 *
 * Mirrors the Live2D validator return shape so the model-selector dialog
 * can present consistent error/warning UX across formats.
 *
 * Use when:
 * - The user picks a `.zip` from the model-selector and we need to decide
 *   whether to import directly or surface a validation modal first.
 *
 * Expects:
 * - `file` is a user-provided ZIP. Non-ZIP inputs return `INVALID`.
 *
 * Returns:
 * - A `SpineValidationReport`. When `status === 'VALID'`, the import path
 *   can run `loadSpineZip()` and pass the assets to `spine.AssetManager`.
 */
export async function validateSpineZip(file: File): Promise<SpineValidationReport> {
  const errors: string[] = []
  const warnings: string[] = []
  const detected: SpineValidationReport['detected'] = { texturePaths: [] }

  try {
    const zip = new JSZip()
    const archive = await zip.loadAsync(file)
    const files = Object.keys(archive.files).filter(name => !archive.files[name].dir)

    const atlasCandidates = files.filter(name => /\.atlas(?:\.txt)?$/i.test(name))
    if (atlasCandidates.length === 0) {
      errors.push('No texture atlas (`.atlas` or `.atlas.txt`) found in the ZIP. A Spine export must include one.')
      return { status: 'INVALID', errors, warnings, detected }
    }
    if (atlasCandidates.length > 1)
      warnings.push(`Multiple atlas files detected (${atlasCandidates.length}). The import will pick the one paired with a same-named skeleton.`)

    const skelCandidates = files.filter(name => name.toLowerCase().endsWith('.skel'))
    const jsonCandidates = files.filter(name => /\.json$/i.test(name) && !/(?:package|manifest)\.json$/i.test(name))

    if (skelCandidates.length === 0 && jsonCandidates.length === 0) {
      errors.push('No skeleton (`.skel` or `.json`) found in the ZIP.')
      return { status: 'INVALID', errors, warnings, detected }
    }

    detected.atlasPath = atlasCandidates[0]
    if (skelCandidates.length > 0) {
      detected.skeletonPath = skelCandidates[0]
      detected.skeletonFormat = 'binary'
    }
    else {
      detected.skeletonPath = jsonCandidates[0]
      detected.skeletonFormat = 'json'
    }

    const textures = files.filter(name => /\.(?:png|webp|jpg|jpeg)$/i.test(name))
    if (textures.length === 0) {
      errors.push('No texture pages (`.png`/`.webp`/`.jpg`) found in the ZIP.')
      return { status: 'INVALID', errors, warnings, detected }
    }
    detected.texturePaths = textures
  }
  catch (err) {
    errors.push(`Failed to read ZIP: ${errorMessageFrom(err) ?? 'Unknown error'}`)
    return { status: 'INVALID', errors, warnings, detected }
  }

  return { status: 'VALID', errors, warnings, detected }
}
