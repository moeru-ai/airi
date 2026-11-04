import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const appRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const eventaIdPattern = /["'](eventa:(?:event|invoke):[^"']+)["']/g

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith(extension) && !file.endsWith('.test.ts'))
    .map(file => join(directory, file))
}

function collectEventaIds(files: string[]): Map<string, string> {
  const ids = new Map<string, string>()
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(eventaIdPattern))
      ids.set(match[1]!, relative(appRoot, file))
  }
  return ids
}

// The C# host and the renderer define each Eventa ID as a string in two languages.
// No compiler checks that the strings match, so this test compares them.
describe('godot Eventa contracts', () => {
  it('defines every C# Eventa ID in the renderer contracts', () => {
    const rendererIds = collectEventaIds(listFiles(resolve(appRoot, 'src-web', 'src', 'shared'), '.ts'))
    const hostIds = collectEventaIds(listFiles(resolve(appRoot, 'src-godot'), '.cs'))

    const missing = [...hostIds]
      .filter(([id]) => !rendererIds.has(id))
      .map(([id, file]) => `${id} (${file})`)

    expect(hostIds.size).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})
