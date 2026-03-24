import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

const LOCAL_EXTENSIONS_DIR = 'openclaw-extensions'

function findLocalExtensionsSourceDir(): string | null {
  if (app.isPackaged) {
    return null
  }

  const candidates = [
    path.join(app.getAppPath(), LOCAL_EXTENSIONS_DIR),
    path.join(process.cwd(), LOCAL_EXTENSIONS_DIR),
  ]

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    }
    catch {
      // Ignore missing candidates.
    }
  }

  return null
}

function findBundledExtensionsDir(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'cfmind', 'extensions')]
    : [
        path.join(app.getAppPath(), 'vendor', 'openclaw-runtime', 'current', 'extensions'),
        path.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current', 'extensions'),
      ]

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    }
    catch {
      // Ignore missing candidates.
    }
  }

  return null
}

export function syncLocalOpenClawExtensionsIntoRuntime(runtimeRoot: string): { sourceDir: string | null, copied: string[] } {
  const sourceDir = findLocalExtensionsSourceDir()
  if (!sourceDir) {
    return { sourceDir: null, copied: [] }
  }

  const targetExtensionsDir = path.join(runtimeRoot, 'extensions')
  try {
    if (!fs.statSync(targetExtensionsDir).isDirectory()) {
      return { sourceDir, copied: [] }
    }
  }
  catch {
    return { sourceDir, copied: [] }
  }

  const copied: string[] = []
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    fs.cpSync(
      path.join(sourceDir, entry.name),
      path.join(targetExtensionsDir, entry.name),
      { recursive: true, force: true },
    )
    copied.push(entry.name)
  }

  return { sourceDir, copied }
}

export function listLocalOpenClawExtensionIds(): string[] {
  const sourceDir = findLocalExtensionsSourceDir()
  if (!sourceDir) {
    return []
  }

  try {
    return fs.readdirSync(sourceDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => fs.existsSync(path.join(sourceDir, entry.name, 'openclaw.plugin.json')))
      .map(entry => entry.name)
  }
  catch {
    return []
  }
}

export function listBundledOpenClawExtensionIds(): string[] {
  const extensionsDir = findBundledExtensionsDir()
  if (!extensionsDir) {
    return []
  }

  try {
    return fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(entry => fs.existsSync(path.join(extensionsDir, entry.name, 'openclaw.plugin.json')))
      .map(entry => entry.name)
  }
  catch {
    return []
  }
}

export function hasBundledOpenClawExtension(extensionId: string): boolean {
  return listBundledOpenClawExtensionIds().includes(extensionId)
    || listLocalOpenClawExtensionIds().includes(extensionId)
}
