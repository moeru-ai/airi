import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { number, object } from 'valibot'
import { afterEach, expect, it, vi } from 'vitest'

import { createConfig } from './persistence'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: electron }))

const directories: string[] = []
const flushes: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(flushes.splice(0).map(flush => flush()))
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

// https://github.com/moeru-ai/airi/pull/2613#issuecomment-5962786944
it('keeps pending configuration saves in their original user data directory', async () => {
  // ROOT CAUSE:
  //
  // A throttled save resolved userData after the next fixture changed it.
  // The namespace-only cache also let the new fixture replace the old data.
  // Binding each store and cache entry to its file keeps fixtures isolated.
  vi.useFakeTimers()
  const firstDirectory = await mkdtemp(join(tmpdir(), 'airi-config-first-'))
  const secondDirectory = await mkdtemp(join(tmpdir(), 'airi-config-second-'))
  directories.push(firstDirectory, secondDirectory)
  const schema = object({ value: number() })

  electron.getPath.mockReturnValue(firstDirectory)
  const first = createConfig('extensions', 'v1.json', schema, { default: { value: 0 } })
  flushes.push(first.flush)
  first.setup()
  first.update({ value: 1 })
  first.update({ value: 2 })

  electron.getPath.mockReturnValue(secondDirectory)
  const second = createConfig('extensions', 'v1.json', schema, { default: { value: 0 } })
  flushes.push(second.flush)
  second.setup()

  expect(first.get()).toEqual({ value: 2 })
  expect(second.get()).toEqual({ value: 0 })

  await first.flush()
  expect(JSON.parse(await readFile(join(firstDirectory, 'extensions-v1.json'), 'utf8'))).toEqual({ value: 2 })
  expect(second.getDiagnostics()?.status).toBe('missing')
  await expect(readFile(join(secondDirectory, 'extensions-v1.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await first.flush()
})

// https://github.com/moeru-ai/airi/pull/2613#issuecomment-5962786944
it('awaits configuration healing before the fixture directory is removed', async () => {
  vi.useFakeTimers()
  const directory = await mkdtemp(join(tmpdir(), 'airi-config-heal-'))
  directories.push(directory)
  const path = join(directory, 'extensions-v1.json')
  await writeFile(path, JSON.stringify({ value: 'invalid' }))
  electron.getPath.mockReturnValue(directory)
  const config = createConfig('extensions', 'v1.json', object({ value: number() }), { default: { value: 0 } })

  flushes.push(config.flush)
  expect(config.setup().status).toBe('invalid')
  await config.flush()

  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: 0 })
  expect(config.getDiagnostics()?.healed).toBe(true)
})
