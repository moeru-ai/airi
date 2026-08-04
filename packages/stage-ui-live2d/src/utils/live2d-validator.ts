import type { JSONObject } from 'pixi-live2d-display'

import JSZip from 'jszip'

import { errorMessageFrom } from '@moeru/std'

import { selectLive2DSettings } from '../generations/loader'
import { decodeZipFileName } from './decode-zip-filename'
import { isCubism2RuntimeConfigured } from './live2d-runtime'
import { isSettingsFile } from './live2d-zip-loader'

export type Live2DRuntimeFamily = 'cubism2' | 'cubism3-plus'

export interface Live2DValidationReport {
  fileName: string
  totalFiles: number
  status: 'VALID' | 'WARNING' | 'INVALID'
  entryPoint: string | null
  runtimeFamily: Live2DRuntimeFamily | null
  structureType: 'Cubism 2 (model.json)' | 'Cubism 3+ (model3.json)' | 'Unknown'
  errors: string[]
  warnings: string[]
  checks: string[]
  mocInfo?: {
    format: 'moc' | 'moc3'
    header: string
    ver: number | null
    size: number
  }
}

function normalizeArchivePath(baseDir: string, relativePath: string): string {
  const stack: string[] = []
  const parts = baseDir ? [...baseDir.split('/'), ...relativePath.split(/[\\/]/)] : relativePath.split(/[\\/]/)
  for (const part of parts) {
    if (!part || part === '.')
      continue
    if (part === '..')
      stack.pop()
    else
      stack.push(part)
  }
  return stack.join('/')
}

/** Validates Cubism 2 and Cubism 3+ model ZIPs without executing either runtime. */
export async function validateLive2DZip(file: File | Blob): Promise<Live2DValidationReport> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: decodeZipFileName })
  const allPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir)

  // Count entry points exactly the way the loader selects one. A raw suffix scan
  // would also claim VTube Studio's `items_pinned_to_model.json` and macOS
  // `__MACOSX/._*.model3.json` sidecars — both end in `model.json` — and report
  // the archive as having several entry points, which the model selector blocks
  // from being imported even though the runtime loads it fine.
  const settingsFiles = allPaths.filter(isSettingsFile)

  const report: Live2DValidationReport = {
    fileName: (file as File).name || 'live2d-model.zip',
    totalFiles: allPaths.length,
    status: 'VALID',
    entryPoint: null,
    runtimeFamily: null,
    structureType: 'Unknown',
    errors: [],
    warnings: [],
    checks: [],
  }

  let selectedSettings: ReturnType<typeof selectLive2DSettings> | undefined
  try {
    const candidates = await Promise.all(settingsFiles.map(async path => ({
      path,
      json: JSON.parse(await zip.file(path)!.async('text')) as JSONObject,
    })))
    selectedSettings = selectLive2DSettings(candidates)
    report.entryPoint = selectedSettings.path
    report.runtimeFamily = selectedSettings.loader.generation === 'cubism2' ? 'cubism2' : 'cubism3-plus'
    report.structureType = selectedSettings.loader.generation === 'cubism2'
      ? 'Cubism 2 (model.json)'
      : 'Cubism 3+ (model3.json)'

    if (selectedSettings.loader.generation === 'cubism2' && !isCubism2RuntimeConfigured()) {
    // Reported as an error, not a warning: this is the same gate the loader
    // checks, so a build without the core is guaranteed to reject the archive
    // with the missing-core message once it reaches the stage. A WARNING report
    // still offers "Import Anyway" in the audit modal, which would only defer
    // that failure past the point where the model was already persisted.
      report.errors.push('Cubism 2 runtime is not present in this build. The core is normally downloaded when AIRI is built, so check the build log for the reason it was skipped, or supply your own copy through AIRI_CUBISM2_CORE_PATH.')
    }
  }
  catch (error) {
    report.errors.push(`Invalid structure: ${errorMessageFrom(error) ?? 'unable to select a Live2D settings entry point'}`)
  }

  if (report.entryPoint && report.runtimeFamily && selectedSettings) {
    try {
      const json = JSON.parse(await zip.file(report.entryPoint)!.async('text')) as JSONObject
      const baseDir = report.entryPoint.split('/').slice(0, -1).join('/')
      const references = selectedSettings.loader.assetReferences(json)

      for (const { path: relativePath, kind: label } of references) {
        const expectedPath = normalizeArchivePath(baseDir, relativePath)
        if (allPaths.includes(expectedPath))
          continue
        const caseMismatch = allPaths.find(path => path.toLowerCase() === expectedPath.toLowerCase())
        report.errors.push(caseMismatch
          ? `Case sensitivity mismatch: ${label} "${relativePath}" resolves to "${expectedPath}", but the ZIP contains "${caseMismatch}".`
          : `Missing reference: ${label} "${relativePath}" expected at "${expectedPath}".`)
      }

      const mocReference = references.find(reference => reference.kind === 'MOC')?.path
      if (mocReference) {
        const mocPath = normalizeArchivePath(baseDir, mocReference)
        const mocFile = zip.file(mocPath)
        if (mocFile) {
          const bytes = await mocFile.async('uint8array')
          const format = report.runtimeFamily === 'cubism2' ? 'moc' : 'moc3'
          const headerLength = format === 'moc' ? 3 : 4
          const header = String.fromCharCode(...bytes.slice(0, headerLength))
          const expectedHeader = format === 'moc' ? 'moc' : 'MOC3'
          report.mocInfo = {
            format,
            header,
            ver: format === 'moc3' ? bytes[4] : null,
            size: bytes.length,
          }
          if (header !== expectedHeader)
            report.errors.push(`Invalid ${format.toUpperCase()} header: "${header}" (expected "${expectedHeader}").`)
          if (bytes.length > 100 * 1024 * 1024)
            report.errors.push(`${format.toUpperCase()} is larger than 100 MB and likely exceeds browser memory limits.`)
          else if (bytes.length > 30 * 1024 * 1024)
            report.warnings.push(`${format.toUpperCase()} is larger than 30 MB and may perform poorly in a browser.`)
        }
      }
      report.checks.push(`Validated ${references.length} referenced Cubism assets.`)
    }
    catch (error) {
      report.errors.push(`JSON parse error in ${report.entryPoint}: ${errorMessageFrom(error) ?? 'Unknown validation error'}`)
    }
  }

  report.status = report.errors.length > 0
    ? 'INVALID'
    : report.warnings.length > 0 ? 'WARNING' : 'VALID'
  return report
}
