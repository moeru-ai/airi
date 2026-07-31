import JSZip from 'jszip'

import { errorMessageFrom } from '@moeru/std'

import { decodeZipFileName } from './decode-zip-filename'
import { isCubism2RuntimeConfigured } from './live2d-runtime'

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

function cubism2References(json: Record<string, unknown>): Array<[string, string]> {
  const references: Array<[string, string]> = []
  if (typeof json.model === 'string')
    references.push([json.model, 'MOC'])
  if (typeof json.physics === 'string')
    references.push([json.physics, 'Physics'])
  if (typeof json.pose === 'string')
    references.push([json.pose, 'Pose'])
  if (Array.isArray(json.textures))
    json.textures.forEach(path => typeof path === 'string' && references.push([path, 'Texture']))

  const motions = json.motions
  if (motions && typeof motions === 'object') {
    for (const definitions of Object.values(motions)) {
      if (!Array.isArray(definitions))
        continue
      for (const definition of definitions) {
        if (definition && typeof definition === 'object' && 'file' in definition && typeof definition.file === 'string')
          references.push([definition.file, 'Motion'])
      }
    }
  }

  if (Array.isArray(json.expressions)) {
    for (const expression of json.expressions) {
      if (expression && typeof expression === 'object' && 'file' in expression && typeof expression.file === 'string')
        references.push([expression.file, 'Expression'])
    }
  }
  return references
}

function cubism3References(json: Record<string, unknown>): Array<[string, string]> {
  const references: Array<[string, string]> = []
  const refs = json.FileReferences
  if (!refs || typeof refs !== 'object')
    return references
  const fileReferences = refs as Record<string, unknown>

  for (const [key, label] of [['Moc', 'MOC'], ['Physics', 'Physics'], ['Pose', 'Pose'], ['DisplayInfo', 'DisplayInfo']] as const) {
    if (typeof fileReferences[key] === 'string')
      references.push([fileReferences[key], label])
  }
  if (Array.isArray(fileReferences.Textures))
    fileReferences.Textures.forEach(path => typeof path === 'string' && references.push([path, 'Texture']))
  if (Array.isArray(fileReferences.Expressions)) {
    for (const expression of fileReferences.Expressions) {
      if (expression && typeof expression === 'object' && 'File' in expression && typeof expression.File === 'string')
        references.push([expression.File, 'Expression'])
    }
  }
  const motions = fileReferences.Motions
  if (motions && typeof motions === 'object') {
    for (const definitions of Object.values(motions)) {
      if (!Array.isArray(definitions))
        continue
      for (const definition of definitions) {
        if (definition && typeof definition === 'object' && 'File' in definition && typeof definition.File === 'string')
          references.push([definition.File, 'Motion'])
      }
    }
  }
  return references
}

/** Validates Cubism 2 and Cubism 3+ model ZIPs without executing either runtime. */
export async function validateLive2DZip(file: File | Blob): Promise<Live2DValidationReport> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: decodeZipFileName })
  const allPaths = Object.keys(zip.files).filter(path => !zip.files[path].dir)
  const model3Files = allPaths.filter(path => path.endsWith('.model3.json'))
  const model2Files = allPaths.filter(path => path.endsWith('model.json'))

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

  if (model2Files.length + model3Files.length !== 1) {
    report.errors.push(`Invalid structure: expected exactly one .model.json or .model3.json entry point, found ${model2Files.length + model3Files.length}.`)
  }
  else if (model3Files.length === 1) {
    report.entryPoint = model3Files[0]
    report.runtimeFamily = 'cubism3-plus'
    report.structureType = 'Cubism 3+ (model3.json)'
  }
  else {
    report.entryPoint = model2Files[0]
    report.runtimeFamily = 'cubism2'
    report.structureType = 'Cubism 2 (model.json)'
    if (!isCubism2RuntimeConfigured()) {
      report.warnings.push('Cubism 2 runtime is not configured in this build. Set AIRI_CUBISM2_CORE_PATH and AIRI_CUBISM2_CORE_SHA256 when building AIRI.')
    }
  }

  const basenames = new Map<string, string[]>()
  for (const path of allPaths) {
    const base = path.split(/[\\/]/).pop()!
    basenames.set(base, [...(basenames.get(base) ?? []), path])
  }
  for (const [base, paths] of basenames) {
    if (paths.length > 1)
      report.errors.push(`Basename collision: "${base}" exists at ${paths.join(', ')}.`)
  }

  if (report.entryPoint && report.runtimeFamily) {
    try {
      const json = JSON.parse(await zip.file(report.entryPoint)!.async('text')) as Record<string, unknown>
      const baseDir = report.entryPoint.split('/').slice(0, -1).join('/')
      const references = report.runtimeFamily === 'cubism2'
        ? cubism2References(json)
        : cubism3References(json)

      for (const [relativePath, label] of references) {
        const expectedPath = normalizeArchivePath(baseDir, relativePath)
        if (allPaths.includes(expectedPath))
          continue
        const caseMismatch = allPaths.find(path => path.toLowerCase() === expectedPath.toLowerCase())
        report.errors.push(caseMismatch
          ? `Case sensitivity mismatch: ${label} "${relativePath}" resolves to "${expectedPath}", but the ZIP contains "${caseMismatch}".`
          : `Missing reference: ${label} "${relativePath}" expected at "${expectedPath}".`)
      }

      const mocReference = references.find(([, label]) => label === 'MOC')?.[0]
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
