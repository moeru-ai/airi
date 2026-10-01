import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { number, object } from 'valibot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createConfig } from './persistence'

const storage = vi.hoisted(() => ({
  directory: '',
  files: new Map<string, string>(),
}))

vi.mock('electron', () => ({
  app: { getPath: () => storage.directory },
}))

vi.mock('node:fs', () => ({
  existsSync: (path: string) => storage.files.has(path),
  readFileSync: (path: string) => {
    const text = storage.files.get(path)
    if (text === undefined)
      throw new Error('Config file is missing')
    return text
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: async () => {},
  copyFile: async (from: string, to: string) => {
    const text = storage.files.get(from)
    if (text === undefined)
      throw new Error('Config file is missing')
    storage.files.set(to, text)
  },
  writeFile: async (path: string, text: string) => {
    storage.files.set(path, text)
  },
  rename: async (from: string, to: string) => {
    const text = storage.files.get(from)
    if (text === undefined)
      throw new Error('Temporary config file is missing')
    storage.files.set(to, text)
    storage.files.delete(from)
  },
}))

describe('config storage ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storage.files.clear()
    storage.directory = join(tmpdir(), 'airi-profile-a')
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
  })

  // ROOT CAUSE:
  // A delayed save resolved the current user-data path and wrote the preceding plugin fixture's enabled IDs into the next fixture.
  // Config stores now bind paths at first use and partition their cached state by that physical file.
  it('keeps a pending save in the directory that owns the configuration', async () => {
    const schema = object({ value: number() })
    const first = createConfig('scope', 'v1.json', schema, { default: { value: 0 } })
    first.setup()
    first.update({ value: 1 })
    await vi.advanceTimersByTimeAsync(0)
    first.update({ value: 2 })

    storage.directory = join(tmpdir(), 'airi-profile-b')
    await vi.advanceTimersByTimeAsync(250)
    const second = createConfig('scope', 'v1.json', schema, { default: { value: 0 } })

    expect(second.setup().status).toBe('missing')
    expect(second.get()).toEqual({ value: 0 })
    expect(JSON.parse(storage.files.get(join(tmpdir(), 'airi-profile-a', 'scope-v1.json'))!)).toEqual({ value: 2 })
  })

  it('isolates cached data and diagnostics between two configuration directories', async () => {
    const schema = object({ value: number() })
    const first = createConfig('scope', 'v1.json', schema, { default: { value: 1 } })
    first.setup()

    storage.directory = join(tmpdir(), 'airi-profile-b')
    const second = createConfig('scope', 'v1.json', schema, { default: { value: 2 } })
    second.setup()
    second.update({ value: 3 })
    await vi.advanceTimersByTimeAsync(0)

    expect(first.get()).toEqual({ value: 1 })
    expect(second.get()).toEqual({ value: 3 })
    expect(first.getDiagnostics()?.path).toBe(join(tmpdir(), 'airi-profile-a', 'scope-v1.json'))
    expect(second.getDiagnostics()?.path).toBe(join(tmpdir(), 'airi-profile-b', 'scope-v1.json'))
  })

  it('shares state between stores that refer to the same physical config file', () => {
    const schema = object({ value: number() })
    const first = createConfig('scope', 'v1.json', schema, { default: { value: 1 } })
    const second = createConfig('scope', 'v1.json', schema, { default: { value: 1 } })
    first.setup()
    second.setup()
    first.update({ value: 2 })

    expect(second.get()).toEqual({ value: 2 })
    expect(second.getDiagnostics()?.path).toBe(first.getDiagnostics()?.path)
  })

  it('honors a startup directory override before the store is first used', async () => {
    const schema = object({ value: number() })
    const config = createConfig('scope', 'v1.json', schema, { default: { value: 1 } })
    storage.directory = join(tmpdir(), 'airi-profile-b')

    expect(config.setup().path).toBe(join(tmpdir(), 'airi-profile-b', 'scope-v1.json'))
    config.update({ value: 2 })
    await vi.advanceTimersByTimeAsync(0)

    expect(storage.files.has(join(tmpdir(), 'airi-profile-a', 'scope-v1.json'))).toBe(false)
    expect(JSON.parse(storage.files.get(join(tmpdir(), 'airi-profile-b', 'scope-v1.json'))!)).toEqual({ value: 2 })
  })
})
