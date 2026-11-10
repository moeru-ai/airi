import JSZip from 'jszip'

import { decodeZipFileName } from './decode-zip-filename'

/** Whether the inspected archive can be imported without review, with warnings, or not at all. */
export type Live2DValidationStatus = 'VALID' | 'WARNING' | 'INVALID'

/** Whether an issue blocks import or only needs review. */
export type Live2DValidationIssueSeverity = 'error' | 'warning'

/** The file type that AIRI uses as the model target. */
export type Live2DModelType = 'model3' | 'moc3' | 'unknown'

/** A stable identifier for a validation rule that produced an issue. */
export type Live2DValidationIssueCode
  = | 'multiple-settings-files'
    | 'missing-settings-file'
    | 'invalid-settings-json'
    | 'missing-moc-reference'
    | 'invalid-moc-header'
    | 'moc-too-large'
    | 'moc-performance-risk'
    | 'missing-reference'
    | 'case-mismatch'
    | 'invalid-resource-json'
    | 'missing-display-info'
    | 'invalid-display-info'
    | 'unreferenced-expressions'
    | 'unreferenced-motions'

/** A problem that AIRI found while it inspected a Live2D archive. */
export interface Live2DValidationIssue {
  code: Live2DValidationIssueCode
  severity: Live2DValidationIssueSeverity
  message: string
  resolution: string
}

/** Base model data that AIRI can read before it loads the Cubism runtime. */
export interface Live2DModelSummary {
  type: Live2DModelType
  entryPoint: string | null
  archiveFileCount: number
  moc: {
    path: string
    version: number
    size: number
  } | null
}

/** Counts the files found in the archive and referenced by the model settings. */
export interface Live2DResourceCount {
  discovered: number
  referenced: number
}

/** Adds the number of resource files that AIRI could parse. */
export interface Live2DParsedResourceCount extends Live2DResourceCount {
  parsed: number
}

/** Resource counts that AIRI can collect without loading the model. */
export interface Live2DResourceSummary {
  textures: Live2DResourceCount
  motions: Live2DParsedResourceCount
  expressions: Live2DParsedResourceCount
  parameters: {
    parsed: number
    source: 'display-info' | 'unavailable'
  }
}

/** The result of inspecting a Live2D ZIP before import. */
export interface Live2DValidationReport {
  fileName: string
  status: Live2DValidationStatus
  model: Live2DModelSummary
  resources: Live2DResourceSummary
  issues: Live2DValidationIssue[]
}

interface ReferenceCheckOptions {
  label: string
  reference: string
  expectedPath: string
  settingsFileName: string
  severity: Live2DValidationIssueSeverity
}

function isIgnoredArchivePath(filePath: string): boolean {
  return filePath
    .split('/')
    .some(segment => segment === '__MACOSX' || segment.startsWith('._'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

/**
 * Normalizes a reference relative to the model settings file.
 *
 * @example
 * resolveArchivePath('model/avatar.model3.json', '../motions/idle.motion3.json')
 * // => 'motions/idle.motion3.json'
 */
function resolveArchivePath(settingsPath: string, reference: string): string {
  const baseSegments = settingsPath.split(/[\\/]/).slice(0, -1)
  const referenceSegments = reference.split(/[\\/]/)
  const resolved: string[] = []

  for (const segment of [...baseSegments, ...referenceSegments]) {
    if (segment === '' || segment === '.')
      continue
    if (segment === '..') {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  return resolved.join('/')
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function readExpressionReferences(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  const references: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      references.push(item)
      continue
    }
    if (!isRecord(item))
      continue

    const file = readString(item.File)
    if (file)
      references.push(file)
  }
  return references
}

function readMotionReferences(value: unknown): string[] {
  if (!isRecord(value))
    return []

  const references: string[] = []
  for (const definitions of Object.values(value)) {
    if (!Array.isArray(definitions))
      continue

    for (const definition of definitions) {
      if (!isRecord(definition))
        continue

      const file = readString(definition.File)
      if (file)
        references.push(file)
    }
  }
  return references
}

async function readJsonObject(zip: JSZip, filePath: string): Promise<Record<string, unknown>> {
  const file = zip.file(filePath)
  if (!file)
    throw new Error(`Archive entry not found: ${filePath}`)

  const value: unknown = JSON.parse(await file.async('text'))
  if (!isRecord(value))
    throw new TypeError(`Expected a JSON object in ${filePath}`)
  return value
}

function addIssue(
  report: Live2DValidationReport,
  code: Live2DValidationIssueCode,
  severity: Live2DValidationIssueSeverity,
  message: string,
  resolution: string,
): void {
  report.issues.push({ code, severity, message, resolution })
}

function checkReference(
  report: Live2DValidationReport,
  archivePaths: string[],
  options: ReferenceCheckOptions,
): boolean {
  if (archivePaths.includes(options.expectedPath))
    return true

  const caseMatch = archivePaths.find(path => path.toLowerCase() === options.expectedPath.toLowerCase())
  if (caseMatch) {
    addIssue(
      report,
      'case-mismatch',
      options.severity,
      `The referenced ${options.label} file "${options.reference}" uses different letter casing.`,
      `Use "${caseMatch}" in ${options.settingsFileName}. Archive paths are case-sensitive.`,
    )
    return false
  }

  addIssue(
    report,
    'missing-reference',
    options.severity,
    `The referenced ${options.label} file "${options.reference}" is missing.`,
    `Add the file at "${options.expectedPath}", or update the ${options.label} path in ${options.settingsFileName}.`,
  )
  return false
}

async function countParsedJsonResources(
  zip: JSZip,
  filePaths: string[],
  resourceName: 'expression' | 'motion',
  report: Live2DValidationReport,
): Promise<number> {
  let parsed = 0
  for (const filePath of filePaths) {
    try {
      await readJsonObject(zip, filePath)
      parsed += 1
    }
    catch {
      addIssue(
        report,
        'invalid-resource-json',
        'warning',
        `The ${resourceName} file "${filePath}" is not valid JSON.`,
        `Export the ${resourceName} again, or remove the invalid file from the archive.`,
      )
    }
  }
  return parsed
}

async function readParameterSummary(
  zip: JSZip,
  displayInfoPath: string | undefined,
  report: Live2DValidationReport,
): Promise<Live2DResourceSummary['parameters']> {
  if (!displayInfoPath)
    return { parsed: 0, source: 'unavailable' }

  try {
    const displayInfo = await readJsonObject(zip, displayInfoPath)
    const parameters = displayInfo.Parameters
    return {
      parsed: Array.isArray(parameters) ? parameters.length : 0,
      source: 'display-info',
    }
  }
  catch {
    addIssue(
      report,
      'invalid-display-info',
      'warning',
      `The display information file "${displayInfoPath}" is not valid JSON.`,
      'Export the display information file again, or remove its reference from the model settings.',
    )
    return { parsed: 0, source: 'unavailable' }
  }
}

function updateStatus(report: Live2DValidationReport): void {
  if (report.issues.some(issue => issue.severity === 'error')) {
    report.status = 'INVALID'
    return
  }
  if (report.issues.some(issue => issue.severity === 'warning')) {
    report.status = 'WARNING'
    return
  }
  report.status = 'VALID'
}

/**
 * Inspects a Live2D ZIP before AIRI imports it.
 *
 * Errors identify missing core resources that block loading. Warnings identify optional
 * resources that AIRI can skip while it loads the model.
 */
export async function validateLive2DZip(file: File | Blob): Promise<Live2DValidationReport> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: decodeZipFileName })
  const archivePaths = Object.entries(zip.files)
    .filter(([filePath, entry]) => !entry.dir && !isIgnoredArchivePath(filePath))
    .map(([filePath]) => filePath)

  let fileName = 'live2d-model.zip'
  if ('name' in file && typeof file.name === 'string' && file.name.length > 0)
    fileName = file.name

  const report: Live2DValidationReport = {
    fileName,
    status: 'VALID',
    model: {
      type: 'unknown',
      entryPoint: null,
      archiveFileCount: archivePaths.length,
      moc: null,
    },
    resources: {
      textures: { discovered: 0, referenced: 0 },
      motions: { discovered: 0, referenced: 0, parsed: 0 },
      expressions: { discovered: 0, referenced: 0, parsed: 0 },
      parameters: { parsed: 0, source: 'unavailable' },
    },
    issues: [],
  }

  const settingsPaths = archivePaths.filter(path => path.toLowerCase().endsWith('.model3.json'))
  const mocPaths = archivePaths.filter(path => path.toLowerCase().endsWith('.moc3'))
  const texturePaths = archivePaths.filter(path => path.toLowerCase().endsWith('.png'))
  const expressionPaths = archivePaths.filter(path => path.toLowerCase().endsWith('.exp3.json'))
  const motionPaths = archivePaths.filter(path => path.toLowerCase().endsWith('.motion3.json'))
  const displayInfoPaths = archivePaths.filter(path => path.toLowerCase().endsWith('.cdi3.json'))

  report.resources.textures.discovered = texturePaths.length
  report.resources.expressions.discovered = expressionPaths.length
  report.resources.motions.discovered = motionPaths.length
  report.resources.expressions.parsed = await countParsedJsonResources(zip, expressionPaths, 'expression', report)
  report.resources.motions.parsed = await countParsedJsonResources(zip, motionPaths, 'motion', report)

  let settings: Record<string, unknown> | undefined
  let references: Record<string, unknown> | undefined
  let settingsFileName = 'model3.json'

  if (settingsPaths.length > 0) {
    const entryPoint = settingsPaths[0]
    report.model.type = 'model3'
    report.model.entryPoint = entryPoint
    settingsFileName = basename(entryPoint)

    if (settingsPaths.length > 1) {
      addIssue(
        report,
        'multiple-settings-files',
        'warning',
        `The archive contains ${settingsPaths.length} model settings files. AIRI will use ${settingsFileName}.`,
        'Keep one model3.json file in each archive, or import each model as a separate ZIP.',
      )
    }

    try {
      settings = await readJsonObject(zip, entryPoint)
      if (isRecord(settings.FileReferences))
        references = settings.FileReferences
    }
    catch {
      addIssue(
        report,
        'invalid-settings-json',
        'error',
        `The model settings file "${entryPoint}" is not valid JSON.`,
        'Export the model settings again, or repair the JSON before import.',
      )
    }
  }
  else if (mocPaths.length === 1) {
    report.model.type = 'moc3'
  }
  else {
    addIssue(
      report,
      'missing-settings-file',
      'error',
      `The archive has no model3.json file and contains ${mocPaths.length} MOC files.`,
      'Add one model3.json file, or keep exactly one MOC3 file and its textures in the archive.',
    )
  }

  let mocPath: string | undefined
  if (report.model.entryPoint && references) {
    const mocReference = readString(references.Moc)
    if (mocReference) {
      const expectedPath = resolveArchivePath(report.model.entryPoint, mocReference)
      if (checkReference(report, archivePaths, {
        label: 'MOC',
        reference: mocReference,
        expectedPath,
        settingsFileName,
        severity: 'error',
      })) {
        mocPath = expectedPath
      }
    }
    else {
      addIssue(
        report,
        'missing-moc-reference',
        'error',
        `${settingsFileName} does not define a MOC file.`,
        `Add FileReferences.Moc to ${settingsFileName}.`,
      )
    }
  }
  else if (!report.model.entryPoint && mocPaths.length === 1) {
    mocPath = mocPaths[0]
  }

  if (mocPath) {
    const moc = await zip.file(mocPath)!.async('uint8array')
    const header = String.fromCharCode(...moc.slice(0, 4))
    const version = moc[4] ?? 0
    const sizeMb = moc.length / 1024 / 1024

    report.model.moc = { path: mocPath, version, size: moc.length }

    if (header !== 'MOC3') {
      addIssue(
        report,
        'invalid-moc-header',
        'error',
        `The MOC file "${mocPath}" does not have a valid MOC3 header.`,
        'Export the MOC3 file again with the Live2D Cubism Editor.',
      )
    }
    if (sizeMb > 100) {
      addIssue(
        report,
        'moc-too-large',
        'error',
        `The MOC file is ${sizeMb.toFixed(2)} MB and exceeds the import limit.`,
        'Reduce the model complexity or texture mesh density, then export the model again.',
      )
    }
    else if (sizeMb > 30) {
      addIssue(
        report,
        'moc-performance-risk',
        'warning',
        `The MOC file is ${sizeMb.toFixed(2)} MB and can reduce rendering performance.`,
        'Reduce the model complexity or texture mesh density for better performance.',
      )
    }
  }

  if (report.model.entryPoint && references) {
    const entryPoint = report.model.entryPoint
    const textureReferences = readStringArray(references.Textures)
    const expressionReferences = readExpressionReferences(references.Expressions)
    const motionReferences = readMotionReferences(references.Motions)

    report.resources.textures.referenced = textureReferences.length
    report.resources.expressions.referenced = expressionReferences.length
    report.resources.motions.referenced = motionReferences.length

    if (textureReferences.length === 0) {
      addIssue(
        report,
        'missing-reference',
        'error',
        `${settingsFileName} does not define any textures.`,
        `Add at least one texture path to FileReferences.Textures in ${settingsFileName}.`,
      )
    }

    for (const reference of textureReferences) {
      checkReference(report, archivePaths, {
        label: 'texture',
        reference,
        expectedPath: resolveArchivePath(entryPoint, reference),
        settingsFileName,
        severity: 'error',
      })
    }

    const optionalReferences: Array<{ label: string, reference: string }> = []
    const physicsReference = readString(references.Physics)
    const poseReference = readString(references.Pose)
    if (physicsReference)
      optionalReferences.push({ label: 'physics', reference: physicsReference })
    if (poseReference)
      optionalReferences.push({ label: 'pose', reference: poseReference })
    for (const optionalReference of optionalReferences) {
      checkReference(report, archivePaths, {
        ...optionalReference,
        expectedPath: resolveArchivePath(entryPoint, optionalReference.reference),
        settingsFileName,
        severity: 'warning',
      })
    }

    for (const reference of expressionReferences) {
      checkReference(report, archivePaths, {
        label: 'expression',
        reference,
        expectedPath: resolveArchivePath(entryPoint, reference),
        settingsFileName,
        severity: 'warning',
      })
    }
    for (const reference of motionReferences) {
      checkReference(report, archivePaths, {
        label: 'motion',
        reference,
        expectedPath: resolveArchivePath(entryPoint, reference),
        settingsFileName,
        severity: 'warning',
      })
    }

    const resolvedExpressionReferences = new Set(expressionReferences.map(reference => resolveArchivePath(entryPoint, reference)))
    const resolvedMotionReferences = new Set(motionReferences.map(reference => resolveArchivePath(entryPoint, reference)))
    const unreferencedExpressionCount = expressionPaths.filter(path => !resolvedExpressionReferences.has(path)).length
    const unreferencedMotionCount = motionPaths.filter(path => !resolvedMotionReferences.has(path)).length

    if (unreferencedExpressionCount > 0) {
      const noun = unreferencedExpressionCount === 1 ? 'expression file is' : 'expression files are'
      addIssue(
        report,
        'unreferenced-expressions',
        'warning',
        `${unreferencedExpressionCount} ${noun} not referenced by ${settingsFileName}.`,
        `Add the files to FileReferences.Expressions in ${settingsFileName}, or remove the unused files.`,
      )
    }
    if (unreferencedMotionCount > 0) {
      const noun = unreferencedMotionCount === 1 ? 'motion file is' : 'motion files are'
      addIssue(
        report,
        'unreferenced-motions',
        'warning',
        `${unreferencedMotionCount} ${noun} not referenced by ${settingsFileName}.`,
        `Add the files to FileReferences.Motions in ${settingsFileName}, or remove the unused files.`,
      )
    }

    const displayInfoReference = readString(references.DisplayInfo)
    let displayInfoPath: string | undefined = displayInfoPaths[0]
    if (displayInfoReference) {
      const expectedPath = resolveArchivePath(entryPoint, displayInfoReference)
      if (archivePaths.includes(expectedPath)) {
        displayInfoPath = expectedPath
      }
      else {
        addIssue(
          report,
          'missing-display-info',
          'warning',
          `The display information file "${displayInfoReference}" is missing.`,
          `Add the file at "${expectedPath}", or remove DisplayInfo from ${settingsFileName}.`,
        )
        displayInfoPath = undefined
      }
    }
    report.resources.parameters = await readParameterSummary(zip, displayInfoPath, report)
  }
  else {
    report.resources.textures.referenced = texturePaths.length
    report.resources.expressions.referenced = expressionPaths.length
    report.resources.motions.referenced = motionPaths.length
    report.resources.parameters = await readParameterSummary(zip, displayInfoPaths[0], report)

    if (!report.model.entryPoint && mocPaths.length === 1 && texturePaths.length === 0) {
      addIssue(
        report,
        'missing-reference',
        'error',
        'The loose model archive does not contain any textures.',
        'Add the model textures to the archive, or export the model with a model3.json file.',
      )
    }
  }

  updateStatus(report)
  return report
}
