import JSZip from 'jszip'

import { LoadingManager } from 'three'

// Global registry to store extracted textures for MMD loading
// This is used by the custom LoadingManager to resolve texture paths
const mmdTextureRegistry = new Map<string, string>()

export function registerMmdTextures(textures: Map<string, string>) {
  // Store textures with normalized lowercase keys for case-insensitive lookup
  textures.forEach((url, path) => {
    // Register with full path (e.g., "刻晴/tex/颜.png")
    const normalizedPath = path.toLowerCase()
    if (!mmdTextureRegistry.has(normalizedPath)) {
      mmdTextureRegistry.set(normalizedPath, url)
      console.log(`[MMD ZIP] Registered texture: "${path}" -> "${url.substring(0, 50)}..."`)
    }

    // Also register with just the relative path after the model directory
    // The PMX file references textures like "tex/颜.png", not "刻晴/tex/颜.png"
    const pathParts = path.split('/')
    if (pathParts.length > 1) {
      const relativePath = pathParts.slice(1).join('/').toLowerCase()
      if (!mmdTextureRegistry.has(relativePath)) {
        mmdTextureRegistry.set(relativePath, url)
        console.log(`[MMD ZIP] Registered relative texture: "${relativePath}"`)
      }
    }

    // Also register just the filename
    const filename = path.split('/').pop()?.toLowerCase()
    if (filename && !mmdTextureRegistry.has(filename)) {
      mmdTextureRegistry.set(filename, url)
      console.log(`[MMD ZIP] Registered filename texture: "${filename}"`)
    }
  })
}

export function unregisterMmdTextures(textures: Map<string, string>) {
  textures.forEach((_, path) => {
    mmdTextureRegistry.delete(path.toLowerCase())
    // Also unregister relative path and filename
    const pathParts = path.split('/')
    if (pathParts.length > 1) {
      const relativePath = pathParts.slice(1).join('/').toLowerCase()
      mmdTextureRegistry.delete(relativePath)
    }
    const filename = path.split('/').pop()?.toLowerCase()
    if (filename) {
      mmdTextureRegistry.delete(filename)
    }
  })
}

/**
 * Get the resolved texture URL from the registry
 * Returns null if not found
 */
export function getMmdTextureUrl(path: string): string | null {
  // Try URL decoding first
  let decodedPath = path
  try {
    decodedPath = decodeURIComponent(path)
  }
  catch {
    // Keep original if decode fails
  }

  // Normalize backslashes to forward slashes
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedDecoded = decodedPath.replace(/\\/g, '/')

  const pathLower = normalizedPath.toLowerCase()
  const decodedLower = normalizedDecoded.toLowerCase()

  // Try exact match first
  if (mmdTextureRegistry.has(pathLower)) {
    return mmdTextureRegistry.get(pathLower)!
  }
  if (mmdTextureRegistry.has(decodedLower) && decodedLower !== pathLower) {
    return mmdTextureRegistry.get(decodedLower)!
  }

  // Try extracting just the filename
  const filename = pathLower.split('/').pop()
  const decodedFilename = decodedLower.split('/').pop()

  // Try matching by filename only (ignore directory)
  for (const [key, value] of mmdTextureRegistry) {
    const registryFilename = key.split('/').pop()

    // Match by filename
    if (registryFilename === filename || registryFilename === decodedFilename) {
      return value
    }

    // Try partial match
    if (filename && key.includes(filename)) {
      return value
    }
    if (decodedFilename && key.includes(decodedFilename)) {
      return value
    }
  }

  return null
}

// Create a custom LoadingManager that resolves MMD texture paths
export function createMmdLoadingManager(): LoadingManager {
  const manager = new LoadingManager()

  // Override URL handling to resolve texture paths
  manager.setURLModifier((url: string) => {
    console.log(`[MMD LoadingManager] URL modifier called with: "${url}"`)
    const resolvedUrl = getMmdTextureUrl(url)
    if (resolvedUrl) {
      console.log(`[MMD LoadingManager] Resolved: "${url}" -> "${resolvedUrl.substring(0, 60)}..."`)
      return resolvedUrl
    }
    console.log(`[MMD LoadingManager] No match for: "${url}"`)
    return url
  })

  return manager
}

export interface MmdZipData {
  modelUrl: string
  vmdUrl?: string
  textures: Map<string, string>
}

/**
 * Extract PMX/PMD model and optional VMD animation from a ZIP file
 */
export async function loadMmdFromZip(file: File): Promise<MmdZipData> {
  const zip = await JSZip.loadAsync(file)

  // Find PMX or PMD file
  let modelFileName: string | undefined
  let modelUrl: string | undefined

  const files = Object.keys(zip.files)

  for (const filePath of files) {
    const lowerPath = filePath.toLowerCase()
    if (lowerPath.endsWith('.pmx') || lowerPath.endsWith('.pmd')) {
      // Prefer PMX over PMD
      if (lowerPath.endsWith('.pmx') || !modelFileName?.toLowerCase().endsWith('.pmx')) {
        modelFileName = filePath
      }
    }
  }

  if (!modelFileName) {
    throw new Error('No PMX or PMD file found in ZIP')
  }

  // Extract model file
  const modelFile = zip.files[modelFileName]
  const modelBlob = await modelFile.async('blob')
  modelUrl = URL.createObjectURL(modelBlob)

  // Find VMD animation file (optional)
  let vmdUrl: string | undefined
  for (const filePath of files) {
    if (filePath.toLowerCase().endsWith('.vmd')) {
      const vmdFile = zip.files[filePath]
      const vmdBlob = await vmdFile.async('blob')
      vmdUrl = URL.createObjectURL(vmdBlob)
      break // Use first VMD found
    }
  }

  // Extract textures (png, jpg, jpeg, tga, bmp)
  const textures = new Map<string, string>()
  for (const filePath of files) {
    const lowerPath = filePath.toLowerCase()
    if (lowerPath.endsWith('.png') || lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || lowerPath.endsWith('.tga') || lowerPath.endsWith('.bmp')) {
      const textureFile = zip.files[filePath]
      const textureBlob = await textureFile.async('blob')
      const ext = lowerPath.split('.').pop()!
      let mimeType = 'image/png'
      if (ext === 'jpg' || ext === 'jpeg')
        mimeType = 'image/jpeg'
      else if (ext === 'bmp')
        mimeType = 'image/bmp'
      const textureUrl = URL.createObjectURL(new Blob([textureBlob], { type: mimeType }))
      textures.set(filePath, textureUrl)
      // console.log(`[MMD ZIP] Extracted texture: "${filePath}"`)
    }
  }

  // Register textures in global registry for MMD loading
  registerMmdTextures(textures)

  return {
    modelUrl,
    vmdUrl,
    textures,
  }
}

/**
 * Clean up URLs created by loadMmdFromZip
 */
export function cleanupMmdZipData(data: MmdZipData) {
  // Unregister textures from global registry
  unregisterMmdTextures(data.textures)

  if (data.modelUrl) {
    URL.revokeObjectURL(data.modelUrl)
  }
  if (data.vmdUrl) {
    URL.revokeObjectURL(data.vmdUrl)
  }
  data.textures.forEach(url => URL.revokeObjectURL(url))
  data.textures.clear()
}
