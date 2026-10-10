import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { defaultDesktopCompanionState } from '../../../shared/desktop-companion'
import { DesktopCompanionFileStorage } from './desktop-companion-storage'

const directories: string[] = []
function storage() {
  const directory = mkdtempSync(join(tmpdir(), 'airi-notifications-'))
  directories.push(directory)
  const path = join(directory, 'desktop-companion.json')
  return { path, directory, store: new DesktopCompanionFileStorage(path) }
}
afterEach(() => {
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }))
})

describe('desktop companion file storage', () => {
  it('loads defaults without writing a missing file', () => {
    const { directory, store } = storage()
    expect(store.load()).toEqual(defaultDesktopCompanionState())
    expect(readdirSync(directory)).toEqual([])
  })

  it('restores settings and unread state from a new storage instance', () => {
    const { directory, path, store } = storage()
    const state = defaultDesktopCompanionState()
    state.preferences.pulsingBorder = false
    state.notifications.push({ id: 'one', source: 'system', body: '', priority: 'normal', createdAt: 1, updatedAt: 1, occurrences: 1, read: false, nativeState: 'suppressed' })
    store.save(state)
    expect(new DesktopCompanionFileStorage(path).load()).toEqual(state)
    expect(readdirSync(directory)).toEqual(['desktop-companion.json'])
  })

  it('round-trips a maximum history of escape-heavy previews and identifiers', () => {
    const { path, store } = storage()
    const state = defaultDesktopCompanionState()
    state.preferences.notificationPreviews = true
    state.notifications = Array.from({ length: 100 }, (_, index) => ({
      id: `${index}`.padEnd(160, '\u0000'),
      source: 'test',
      coalesceKey: '\u0000'.repeat(160),
      body: '\u0000'.repeat(4000),
      priority: 'normal',
      createdAt: 100_000,
      updatedAt: 100_000,
      occurrences: 1,
      read: false,
      nativeState: 'suppressed',
    }))
    state.recentEventIds = Array.from({ length: 200 }, (_, index) => `${index}`.padEnd(160, '\u0000'))
    store.save(state)
    expect(statSync(path).size).toBeGreaterThan(2_000_000)
    expect(new DesktopCompanionFileStorage(path).load()).toEqual(state)
  })

  it('preserves malformed files for recovery', () => {
    const { path, store } = storage()
    writeFileSync(path, '{broken')
    expect(() => store.load()).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{broken')
  })

  it('rejects oversized files and invalid state without replacing the previous file', () => {
    const { path, store } = storage()
    writeFileSync(path, 'x'.repeat(4 * 1024 * 1024 + 1))
    expect(() => store.load()).toThrow('size limit')
    const initial = defaultDesktopCompanionState()
    store.save(initial)
    expect(() => store.save({ ...initial, revision: -1 })).toThrow()
    expect(() => store.save({ ...initial, lastNativeAt: Number.POSITIVE_INFINITY })).toThrow()
    expect(store.load()).toEqual(initial)
  })
})
