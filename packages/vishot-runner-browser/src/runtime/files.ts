import path from 'node:path'

const nonFilenameCharactersPattern = /[^a-z0-9-_]+/g
const edgeDashPattern = /^-+|-+$/g

export function sanitizeOutputName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(nonFilenameCharactersPattern, '-')
    .replace(edgeDashPattern, '')

  return sanitized.length > 0 ? sanitized : 'capture'
}

export function captureFilePath(outputDir: string, rootName: string): string {
  return path.resolve(outputDir, `${sanitizeOutputName(rootName)}.png`)
}

export function assertUniqueCaptureFilePaths(rootNames: string[]): void {
  const seenFilePaths = new Map<string, string>()

  for (const rootName of rootNames) {
    const sanitizedName = sanitizeOutputName(rootName)
    const previousRootName = seenFilePaths.get(sanitizedName)

    if (previousRootName) {
      throw new Error(
        `Capture roots "${previousRootName}" and "${rootName}" both resolve to "${sanitizedName}.png". Root names must map to unique output files.`,
      )
    }

    seenFilePaths.set(sanitizedName, rootName)
  }
}
