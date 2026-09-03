import JSZip from 'jszip'

import { parseLive2DExpression } from '../contexts/expressions'
import { decodeZipFileName } from '../utils/decode-zip-filename'

/** Cubism references that can declare expression and motion controls. */
export interface Live2DModelControlReferences {
  /** Named expression files from Cubism FileReferences. */
  Expressions?: Array<{ Name: string, File: string }>
  /** Motion files grouped by their Cubism motion group. */
  Motions?: Record<string, Array<{ File: string }>>
}

/** Describes one expression that a loaded Live2D model exposes. */
export interface Live2DExpressionControl {
  /** Exact expression name accepted by the Live2D runtime. */
  name: string
  /** Expression file in the loaded model. */
  fileName: string
  /** Parameter operations parsed from the exp3 resource when its content is available. */
  parameters?: readonly Live2DExpressionParameterControl[]
}

/** Describes one parameter operation exposed by a Live2D expression. */
export interface Live2DExpressionParameterControl {
  parameterId: string
  blend: 'Add' | 'Multiply' | 'Overwrite'
  value: number
}

/** Maps one motion file to its Cubism motion entry. */
export interface Live2DMotionControl {
  /** Exact motion file accepted by the Live2D runtime. */
  fileName: string
  /** Cubism motion group used by the renderer. */
  group: string
  /** Motion index inside the Cubism group. */
  index: number
}

/** Lists the expressions and motions that one Live2D model exposes. */
export interface Live2DModelControls {
  expressions: Live2DExpressionControl[]
  motions: Live2DMotionControl[]
}

function shouldIgnoreArchiveEntry(filePath: string) {
  return filePath
    .split('/')
    .some(segment => segment === '__MACOSX' || segment.startsWith('._'))
}

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

function toModelResourceReference(settingsPath: string, resourcePath: string): string {
  const settingsDirectory = settingsPath.split(/[\\/]/).slice(0, -1)
  const resourceSegments = resourcePath.split(/[\\/]/).filter(Boolean)
  let commonSegmentCount = 0

  while (
    commonSegmentCount < settingsDirectory.length
    && commonSegmentCount < resourceSegments.length
    && settingsDirectory[commonSegmentCount] === resourceSegments[commonSegmentCount]
  ) {
    commonSegmentCount += 1
  }

  return [
    ...settingsDirectory.slice(commonSegmentCount).map(() => '..'),
    ...resourceSegments.slice(commonSegmentCount),
  ].join('/')
}

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function expressionNameFromPath(filePath: string) {
  return fileNameFromPath(filePath).replace(/\.exp3\.json$/i, '')
}

/**
 * Resolves referenced and unreferenced controls with stable runtime IDs.
 *
 * The Live2D loader and archive inspector use this interface. This keeps
 * prompt IDs, editor IDs, and renderer IDs equal.
 */
export function resolveLive2DModelControls(
  settingsPath: string,
  references: Live2DModelControlReferences,
  filePaths: readonly string[],
): Live2DModelControls {
  const expressions = (references.Expressions ?? []).map(expression => ({
    name: expression.Name,
    fileName: expression.File,
  }))
  const referencedExpressionPaths = new Set(
    expressions.map(expression => resolveArchivePath(settingsPath, expression.fileName)),
  )
  const expressionNames = new Set(expressions.map(expression => expression.name))

  for (const filePath of filePaths.filter(path => path.toLowerCase().endsWith('.exp3.json'))) {
    if (referencedExpressionPaths.has(filePath))
      continue

    const fileName = toModelResourceReference(settingsPath, filePath)
    const baseName = expressionNameFromPath(filePath)
    const name = expressionNames.has(baseName)
      ? fileName.replace(/\.exp3\.json$/i, '')
      : baseName

    expressions.push({ name, fileName })
    expressionNames.add(name)
  }

  const motions = Object.entries(references.Motions ?? {}).flatMap(([group, entries]) => entries.map((motion, index) => ({
    fileName: motion.File,
    group,
    index,
  })))
  const referencedMotionPaths = new Set(
    motions.map(motion => resolveArchivePath(settingsPath, motion.fileName)),
  )
  const discoveredMotions = filePaths
    .filter(path => path.toLowerCase().endsWith('.motion3.json'))
    .filter(path => !referencedMotionPaths.has(path))

  const discoveredMotionIndexOffset = motions.filter(motion => motion.group === 'AIRI').length
  motions.push(...discoveredMotions.map((filePath, index) => ({
    fileName: toModelResourceReference(settingsPath, filePath),
    group: 'AIRI',
    index: discoveredMotionIndexOffset + index,
  })))

  return {
    expressions: [...new Map(expressions.map(expression => [expression.name, expression])).values()],
    motions: [...new Map(motions.map(motion => [motion.fileName, motion])).values()],
  }
}

/**
 * Reads the controls from a Live2D archive without loading its renderer.
 *
 * The result uses the same identifiers and motion indexes as the runtime.
 * This function does not change the archive or the current model state.
 */
export async function inspectLive2DModelControls(source: Blob): Promise<Live2DModelControls> {
  const reader = await JSZip.loadAsync(await source.arrayBuffer(), { decodeFileName: decodeZipFileName })
  const filePaths = Object.keys(reader.files).filter(filePath => !shouldIgnoreArchiveEntry(filePath))
  const cubism4SettingsPath = filePaths.find(filePath => filePath.endsWith('.model3.json'))
  let settingsPath: string
  let references: Live2DModelControlReferences

  if (!cubism4SettingsPath) {
    if (filePaths.some(filePath => filePath.endsWith('.model.json')))
      return { expressions: [], motions: [] }

    const mocFiles = filePaths.filter(filePath => filePath.endsWith('.moc3'))
    if (mocFiles.length !== 1)
      throw new Error(`Expected exactly one moc file, got ${mocFiles.length}`)
    if (!filePaths.some(filePath => filePath.endsWith('.png')))
      throw new Error('Textures not found')

    const modelName = fileNameFromPath(mocFiles[0]).replace(/\.moc3$/i, '')
    settingsPath = `${modelName}.model3.json`
    references = {
      Motions: {
        '': filePaths
          .filter(filePath => filePath.endsWith('.motion3.json'))
          .map(filePath => ({ File: filePath })),
      },
    }
  }
  else {
    const settingsFile = reader.file(cubism4SettingsPath)
    if (!settingsFile)
      throw new Error(`Cannot find file: ${cubism4SettingsPath}`)

    const settings = JSON.parse(await settingsFile.async('text')) as {
      FileReferences?: Live2DModelControlReferences
    }
    settingsPath = cubism4SettingsPath
    references = settings.FileReferences ?? {}
  }

  const controls = resolveLive2DModelControls(settingsPath, references, filePaths)
  const expressions = await Promise.all(controls.expressions.map(async (expression) => {
    const expressionPath = resolveArchivePath(settingsPath, expression.fileName)
    const expressionFile = reader.file(expressionPath)
    if (!expressionFile)
      return expression

    const definition = parseLive2DExpression(
      expression.name,
      expression.fileName,
      await expressionFile.async('text'),
    )
    return {
      ...expression,
      parameters: definition.parameters,
    }
  }))

  return { ...controls, expressions }
}
