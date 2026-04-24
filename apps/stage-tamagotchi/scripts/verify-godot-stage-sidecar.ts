import type { Configuration } from 'electron-builder'

import process from 'node:process'

import { access, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { cac } from 'cac'

import { getElectronBuilderConfig } from './utils'

interface ExportPreset {
  exportPath: string
  name: string
}

interface ExpectedGodotExport {
  electronBuilderOs: 'linux' | 'mac' | 'win'
  exportPath: string
  packagedBinarySuffix: string[]
  presetName: string
}

const GODOT_ENGINE_DIR = resolve(import.meta.dirname, '..', '..', '..', 'engines', 'stage-tamagotchi-godot')
const EXPORT_PRESETS_PATH = join(GODOT_ENGINE_DIR, 'export_presets.cfg')
const APP_DIST_DIR = resolve(import.meta.dirname, '..', 'dist')

const EXPECTED_GODOT_EXPORTS: ExpectedGodotExport[] = [
  {
    presetName: 'Windows Desktop',
    electronBuilderOs: 'win',
    exportPath: 'build/win/godot-stage.exe',
    packagedBinarySuffix: ['resources', 'godot-stage', 'godot-stage.exe'],
  },
  {
    presetName: 'Linux',
    electronBuilderOs: 'linux',
    exportPath: 'build/linux/godot-stage',
    packagedBinarySuffix: ['resources', 'godot-stage', 'godot-stage'],
  },
  {
    presetName: 'macOS',
    electronBuilderOs: 'mac',
    exportPath: 'build/mac/godot-stage.app',
    packagedBinarySuffix: ['Contents', 'Resources', 'godot-stage', 'godot-stage.app', 'Contents', 'MacOS', 'godot-stage'],
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Normalizes config paths for slash-insensitive comparison.
 *
 * Before:
 * - "..\\..\\engines\\stage-tamagotchi-godot\\build\\${os}"
 *
 * After:
 * - "../../engines/stage-tamagotchi-godot/build/${os}"
 */
function normalizeConfigPath(value: string) {
  return value.replace(/\\/g, '/')
}

function parseGodotStringField(line: string, field: string) {
  const match = line.match(new RegExp(`^${field}="(.*)"$`))
  return match?.[1]
}

async function parseExportPresets() {
  const text = await readFile(EXPORT_PRESETS_PATH, 'utf-8')
  const presets: ExportPreset[] = []
  let current: Partial<ExportPreset> | undefined

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (/^\[preset\.\d+\]$/.test(line)) {
      if (current?.name && current.exportPath) {
        presets.push({
          name: current.name,
          exportPath: normalizeConfigPath(current.exportPath),
        })
      }

      current = {}
      continue
    }

    if (!current) {
      continue
    }

    const name = parseGodotStringField(line, 'name')
    if (name) {
      current.name = name
      continue
    }

    const exportPath = parseGodotStringField(line, 'export_path')
    if (exportPath) {
      current.exportPath = exportPath
    }
  }

  if (current?.name && current.exportPath) {
    presets.push({
      name: current.name,
      exportPath: normalizeConfigPath(current.exportPath),
    })
  }

  return presets
}

function getGodotStageExtraResource(config: Configuration) {
  const extraResources = Array.isArray(config.extraResources)
    ? config.extraResources
    : config.extraResources
      ? [config.extraResources]
      : []

  for (const entry of extraResources) {
    if (!isRecord(entry)) {
      continue
    }

    const from = entry.from
    const to = entry.to

    if (typeof from !== 'string' || typeof to !== 'string') {
      continue
    }

    if (to === 'godot-stage') {
      return {
        from: normalizeConfigPath(from),
        to,
      }
    }
  }

  return undefined
}

async function verifyExportPresetAlignment() {
  const [presets, electronBuilderConfig] = await Promise.all([
    parseExportPresets(),
    getElectronBuilderConfig(),
  ])
  const sidecarResource = getGodotStageExtraResource(electronBuilderConfig)

  if (!sidecarResource) {
    throw new Error('electron-builder extraResources does not contain a godot-stage resource entry.')
  }

  const electronBuilderOsMacro = '${' + 'os}'
  const expectedSourceSuffix = `engines/stage-tamagotchi-godot/build/${electronBuilderOsMacro}`

  if (!sidecarResource.from.endsWith(expectedSourceSuffix)) {
    throw new Error(`electron-builder godot-stage source must end with ${expectedSourceSuffix}. Got: ${sidecarResource.from}`)
  }

  for (const expected of EXPECTED_GODOT_EXPORTS) {
    const preset = presets.find(item => item.name === expected.presetName)
    if (!preset) {
      throw new Error(`Godot export preset not found: ${expected.presetName}`)
    }

    if (preset.exportPath !== expected.exportPath) {
      throw new Error(
        `Godot export preset "${expected.presetName}" must write to ${expected.exportPath} `
        + `so electron-builder \${os}=${expected.electronBuilderOs} can collect it. Got: ${preset.exportPath}`,
      )
    }
  }

  console.info('Godot export presets match electron-builder godot-stage resource paths.')
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath))
      continue
    }

    files.push(entryPath)
  }

  return files
}

function getExpectedPackagedSuffix() {
  switch (process.platform) {
    case 'win32':
      return EXPECTED_GODOT_EXPORTS.find(item => item.electronBuilderOs === 'win')!.packagedBinarySuffix
    case 'darwin':
      return EXPECTED_GODOT_EXPORTS.find(item => item.electronBuilderOs === 'mac')!.packagedBinarySuffix
    default:
      return EXPECTED_GODOT_EXPORTS.find(item => item.electronBuilderOs === 'linux')!.packagedBinarySuffix
  }
}

function pathEndsWithSegments(filePath: string, suffix: string[]) {
  const normalized = normalizeConfigPath(filePath)
  return normalized.endsWith(suffix.join('/'))
}

async function verifyPackagedSidecar(distDirectory: string) {
  const resolvedDistDirectory = resolve(distDirectory)

  try {
    await access(resolvedDistDirectory)
  }
  catch {
    throw new Error(`electron-builder dist directory does not exist: ${resolvedDistDirectory}`)
  }

  // Check the unpacked app output produced by `electron-builder --dir`; installer-only
  // outputs are not enough to prove runtime `process.resourcesPath/godot-stage` works.
  const files = await walkFiles(resolvedDistDirectory)
  const expectedSuffix = getExpectedPackagedSuffix()
  const match = files.find(file => pathEndsWithSegments(file, expectedSuffix))

  if (!match) {
    throw new Error(`Packaged Godot sidecar binary not found under ${resolvedDistDirectory}. Expected suffix: ${expectedSuffix.join('/')}`)
  }

  console.info(`Packaged Godot sidecar binary found: ${match}`)
}

/**
 * Verifies the Godot sidecar packaging contract.
 *
 * Call stack:
 *
 * verify-godot-stage-sidecar CLI
 *   -> {@link verifyExportPresetAlignment}
 *     -> {@link parseExportPresets}
 *     -> {@link getGodotStageExtraResource}
 *   -> {@link verifyPackagedSidecar}
 *
 * Use when:
 * - CI needs to catch Godot export path drift before release packaging
 * - `electron-builder --dir` output needs a packaged sidecar smoke check
 *
 * Expects:
 * - Godot exports to use electron-builder `${os}` directory names
 * - `--packaged` to run after `electron-builder --dir`
 *
 * Returns:
 * - Exits with code 0 on success, 1 on mismatch
 */
async function main() {
  const cli = cac('verify-godot-stage-sidecar')
    .option(
      '--packaged',
      'Also verify electron-builder --dir output contains the Godot sidecar binary',
      { default: false },
    )
    .option(
      '--dist-dir <path>',
      'electron-builder dist directory to inspect when --packaged is enabled',
      { default: APP_DIST_DIR, type: [String] },
    )

  const args = cli.parse()
  const options = args.options as {
    distDir: string
    packaged: boolean
  }

  await verifyExportPresetAlignment()

  if (options.packaged) {
    await verifyPackagedSidecar(options.distDir)
  }
}

main()
  .catch((error) => {
    console.error('Godot stage sidecar verification failed:', error)
    process.exit(1)
  })
