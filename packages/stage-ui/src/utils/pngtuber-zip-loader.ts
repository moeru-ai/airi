import type { PNGtuberManifest } from '../stores/display-models'

import JSZip from 'jszip'

export interface PNGtuberLoadedModel {
  manifest: PNGtuberManifest
  images: Map<string, Blob>
  manifestUrl: string
}

/**
 * Load a PNGtuber model from a ZIP file
 */
export async function loadPNGtuberFromZip(zipFile: File | Blob): Promise<PNGtuberLoadedModel> {
  const zip = await JSZip.loadAsync(zipFile)
  const filePaths = Object.keys(zip.files)

  // Find manifest.json
  const manifestPath = filePaths.find(path => path.endsWith('manifest.json'))
  if (!manifestPath) {
    throw new Error('PNGtuber manifest.json not found in ZIP file')
  }

  // Get the base directory of the manifest
  const baseDir = manifestPath.substring(0, manifestPath.lastIndexOf('/') + 1)

  // Read manifest
  const manifestFile = zip.file(manifestPath)
  if (!manifestFile) {
    throw new Error('Cannot read manifest.json')
  }

  const manifestText = await manifestFile.async('text')
  let manifest: PNGtuberManifest

  try {
    manifest = JSON.parse(manifestText)
  }
  catch {
    throw new Error('Invalid manifest.json format')
  }

  // Validate manifest
  if (!manifest.version || !manifest.idle?.default) {
    throw new Error('Invalid PNGtuber manifest: missing required fields (version, idle.default)')
  }

  // Load all referenced images
  const images = new Map<string, Blob>()
  const imagesToLoad: string[] = []

  // Collect all image paths from manifest
  imagesToLoad.push(manifest.idle.default)
  if (manifest.idle.blink)
    imagesToLoad.push(manifest.idle.blink)

  if (manifest.mouth) {
    if (manifest.mouth.closed)
      imagesToLoad.push(manifest.mouth.closed)
    if (manifest.mouth.open)
      imagesToLoad.push(manifest.mouth.open)
    if (manifest.mouth.a)
      imagesToLoad.push(manifest.mouth.a)
    if (manifest.mouth.e)
      imagesToLoad.push(manifest.mouth.e)
    if (manifest.mouth.i)
      imagesToLoad.push(manifest.mouth.i)
    if (manifest.mouth.o)
      imagesToLoad.push(manifest.mouth.o)
    if (manifest.mouth.u)
      imagesToLoad.push(manifest.mouth.u)
  }

  if (manifest.emotions) {
    for (const emotion of Object.values(manifest.emotions)) {
      imagesToLoad.push(emotion.default)
      if (emotion.blink)
        imagesToLoad.push(emotion.blink)
    }
  }

  // Load images from ZIP
  for (const imagePath of imagesToLoad) {
    const fullPath = baseDir + imagePath
    const imageFile = zip.file(fullPath)

    if (!imageFile) {
      console.warn(`PNGtuber image not found in ZIP: ${fullPath}`)
      continue
    }

    const blob = await imageFile.async('blob')
    images.set(imagePath, blob)
  }

  // Create object URL for manifest (for compatibility with existing loading system)
  const manifestBlob = new Blob([manifestText], { type: 'application/json' })
  const manifestUrl = URL.createObjectURL(manifestBlob)

  return {
    manifest,
    images,
    manifestUrl,
  }
}

/**
 * Create object URLs for all images in a PNGtuber model
 */
export function createPNGtuberImageURLs(model: PNGtuberLoadedModel): Map<string, string> {
  const urls = new Map<string, string>()

  for (const [path, blob] of model.images) {
    urls.set(path, URL.createObjectURL(blob))
  }

  return urls
}

/**
 * Revoke all object URLs for a PNGtuber model
 */
export function revokePNGtuberURLs(manifestUrl: string, imageUrls: Map<string, string>): void {
  URL.revokeObjectURL(manifestUrl)

  for (const url of imageUrls.values()) {
    URL.revokeObjectURL(url)
  }
}

/**
 * Check if a ZIP file contains a valid PNGtuber model
 */
export async function isPNGtuberZip(zipFile: File | Blob): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(zipFile)
    const filePaths = Object.keys(zip.files)
    return filePaths.some(path => path.endsWith('manifest.json'))
  }
  catch {
    return false
  }
}
