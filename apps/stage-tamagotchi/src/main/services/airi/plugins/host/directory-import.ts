import type { Stats } from 'node:fs'

import type { ExtensionManifestV2 } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  ExtensionDirectoryImportKitSummary,
  ExtensionDirectoryImportPermissionSummary,
  ExtensionDirectoryImportPlan,
} from '../../../../../shared/eventa/plugin/host'

import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import { parseExtensionManifest } from '@proj-airi/plugin-sdk/plugin-host'

import { extensionManifestFileName } from './registry'

const importPlanTtlMs = 10 * 60 * 1000

interface InspectedExtensionDirectory {
  sourcePath: string
  manifest: ExtensionManifestV2
  fileCount: number
  totalBytes: number
  fingerprint: string
}

interface StoredImportPlan {
  preview: ExtensionDirectoryImportPlan
  sourcePath: string
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  }
  catch (error) {
    if (isMissingPathError(error)) {
      return false
    }
    throw error
  }
}

function isContainedPath(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === ''
    || (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
}

function formatManifestDiagnostics(diagnostics: Array<{ path: string, message: string }>): string {
  return diagnostics.map(diagnostic => `${diagnostic.path}: ${diagnostic.message}`).join('; ')
}

function summarizePermissions(manifest: ExtensionManifestV2): ExtensionDirectoryImportPermissionSummary[] {
  const areas = ['apis', 'capabilities', 'pipelines', 'processors', 'resources'] as const
  return areas.flatMap((area) => {
    return (manifest.permissions[area] ?? []).map(permission => ({
      area,
      key: permission.key,
      actions: [...permission.actions],
      required: permission.required ?? false,
    }))
  })
}

function summarizeKits(manifest: ExtensionManifestV2): ExtensionDirectoryImportKitSummary[] {
  return [
    ...(manifest.kits?.provides ?? []).map(kit => ({
      direction: 'provides' as const,
      id: kit.id,
      version: kit.version,
      exposure: kit.exposure,
    })),
    ...(manifest.kits?.uses ?? []).map(kit => ({
      direction: 'uses' as const,
      id: kit.id,
      version: kit.version,
      optional: kit.optional ?? false,
    })),
  ]
}

async function assertRegularFile(path: string, label: string): Promise<Stats> {
  let stats: Stats
  try {
    stats = await lstat(path)
  }
  catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(`${label} does not exist: ${path}`)
    }
    throw error
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`)
  }
  return stats
}

async function inspectExtensionDirectory(sourcePath: string): Promise<InspectedExtensionDirectory> {
  const sourceStats = await lstat(sourcePath)
  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
    throw new Error(`Extension source must be a regular directory: ${sourcePath}`)
  }

  const sourceRealPath = await realpath(sourcePath)
  const manifestPath = join(sourceRealPath, extensionManifestFileName)
  await assertRegularFile(manifestPath, 'Extension manifest')

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
  }
  catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Extension manifest is not valid JSON: ${error.message}`)
    }
    throw error
  }

  const parsedManifest = parseExtensionManifest(rawManifest)
  if (!parsedManifest.success) {
    throw new Error(`Extension manifest is invalid: ${formatManifestDiagnostics(parsedManifest.diagnostics)}`)
  }

  const files: Array<{ path: string, relativePath: string, size: number }> = []
  const directories = ['.']
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const stats = await lstat(path)
      const relativePath = relative(sourceRealPath, path)

      if (stats.isSymbolicLink()) {
        throw new Error(`Extension packages cannot contain symbolic links: ${relativePath}`)
      }
      if (stats.isDirectory()) {
        directories.push(relativePath)
        await walk(path)
        continue
      }
      if (!stats.isFile()) {
        throw new Error(`Extension packages can contain only files and directories: ${relativePath}`)
      }
      files.push({ path, relativePath, size: stats.size })
    }
  }
  await walk(sourceRealPath)

  for (const entrypoint of Object.values(parsedManifest.manifest.entrypoints)) {
    if (!entrypoint) {
      continue
    }
    if (isAbsolute(entrypoint)) {
      throw new Error(`Imported Extension entrypoints must be relative paths: ${entrypoint}`)
    }
    const resolvedEntrypoint = resolve(sourceRealPath, entrypoint)
    if (!isContainedPath(sourceRealPath, resolvedEntrypoint)) {
      throw new Error(`Extension entrypoint escapes the package folder: ${entrypoint}`)
    }
    await assertRegularFile(resolvedEntrypoint, 'Extension entrypoint')
    const entrypointRealPath = await realpath(resolvedEntrypoint)
    if (!isContainedPath(sourceRealPath, entrypointRealPath)) {
      throw new Error(`Extension entrypoint resolves outside the package folder: ${entrypoint}`)
    }
  }

  directories.sort()
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const fingerprint = createHash('sha256')
  for (const directory of directories) {
    fingerprint.update(`directory\0${directory}\0`)
  }
  for (const file of files) {
    fingerprint.update(`file\0${file.relativePath}\0${file.size}\0`)
    fingerprint.update(await readFile(file.path))
    fingerprint.update('\0')
  }

  return {
    sourcePath: sourceRealPath,
    manifest: parsedManifest.manifest,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.size, 0),
    fingerprint: fingerprint.digest('hex'),
  }
}

/**
 * Owns the prepare, review, and atomic commit lifecycle for folder imports.
 *
 * Prepare reads package data but never executes Extension code. Commit repeats
 * validation and publishes one immutable copy under the managed registry root.
 */
export class ExtensionDirectoryImporter {
  private readonly plans = new Map<string, StoredImportPlan>()
  private commitQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly extensionsRoot: string,
    private readonly isExtensionInstalled: (extensionId: string) => boolean | Promise<boolean> = () => false,
  ) {}

  /** Creates a short-lived import plan from an untrusted source directory. */
  async prepare(sourcePath: string): Promise<ExtensionDirectoryImportPlan> {
    const inspected = await inspectExtensionDirectory(sourcePath)
    await this.assertDestinationAvailable(inspected.manifest.id)

    const planId = randomUUID()
    const preview: ExtensionDirectoryImportPlan = {
      planId,
      sourcePath: inspected.sourcePath,
      extensionId: inspected.manifest.id,
      version: inspected.manifest.version,
      runtimes: [...inspected.manifest.engines.runtimes],
      entrypoints: { ...inspected.manifest.entrypoints },
      permissions: summarizePermissions(inspected.manifest),
      kits: summarizeKits(inspected.manifest),
      fileCount: inspected.fileCount,
      totalBytes: inspected.totalBytes,
      fingerprint: inspected.fingerprint,
      createdAt: Date.now(),
    }
    this.plans.set(planId, { preview, sourcePath: inspected.sourcePath })
    return structuredClone(preview)
  }

  /** Publishes a prepared package and returns its final manifest path. */
  async commit(planId: string): Promise<{ extensionId: string, manifestPath: string }> {
    const result = this.commitQueue.then(() => this.commitPreparedPlan(planId))
    this.commitQueue = result.then(() => undefined, () => undefined)
    return await result
  }

  /** Cancels one prepared plan without changing the managed Extension folder. */
  cancel(planId: string): void {
    this.plans.delete(planId)
  }

  /** Clears in-memory plans during host shutdown. */
  dispose(): void {
    this.plans.clear()
  }

  private async assertDestinationAvailable(extensionId: string): Promise<void> {
    const destination = join(this.extensionsRoot, extensionId)
    if (await this.isExtensionInstalled(extensionId) || await pathExists(destination)) {
      throw new Error(`Extension is already installed: ${extensionId}`)
    }
  }

  private async commitPreparedPlan(planId: string): Promise<{ extensionId: string, manifestPath: string }> {
    const storedPlan = this.plans.get(planId)
    if (!storedPlan) {
      throw new Error('Extension import plan is missing or was already used.')
    }
    if (Date.now() - storedPlan.preview.createdAt > importPlanTtlMs) {
      this.plans.delete(planId)
      throw new Error('Extension import plan expired. Select the folder again.')
    }

    const inspected = await inspectExtensionDirectory(storedPlan.sourcePath)
    if (inspected.manifest.id !== storedPlan.preview.extensionId || inspected.fingerprint !== storedPlan.preview.fingerprint) {
      throw new Error('Extension source changed after review. Select the folder again.')
    }

    await this.assertDestinationAvailable(inspected.manifest.id)
    await mkdir(this.extensionsRoot, { recursive: true })
    const stagingRoot = join(this.extensionsRoot, '.imports')
    await mkdir(stagingRoot, { recursive: true })
    const stagingPath = join(stagingRoot, planId)
    const destination = join(this.extensionsRoot, inspected.manifest.id)

    try {
      await cp(inspected.sourcePath, stagingPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        verbatimSymlinks: true,
      })
      const staged = await inspectExtensionDirectory(stagingPath)
      if (staged.manifest.id !== inspected.manifest.id || staged.fingerprint !== inspected.fingerprint) {
        throw new Error('Extension copy does not match the reviewed package.')
      }
      await this.assertDestinationAvailable(inspected.manifest.id)
      await rename(stagingPath, destination)
      this.plans.delete(planId)
      return {
        extensionId: inspected.manifest.id,
        manifestPath: join(destination, extensionManifestFileName),
      }
    }
    catch (error) {
      await rm(stagingPath, { recursive: true, force: true })
      throw error
    }
  }
}
