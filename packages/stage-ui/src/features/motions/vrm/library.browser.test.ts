import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { motionLibraryChanged, motionPreferencesChanged } from './bus'
import { createMotionPrompt, defaultMotionPreferences, importMotion, listImportedMotions, readMotionBytes, readMotionPreferences, removeMotion, updateMotionPreferences } from './library'
import { useVrmMotionsStore } from './store'

const importedIds: string[] = []
afterEach(async () => {
  for (const id of importedIds.splice(0))
    await removeMotion(id)
})

async function fixture() {
  const response = await fetch(new URL('./relaxed-idle.vrma', import.meta.url))
  return new File([await response.arrayBuffer()], 'Local relaxed idle.vrma', { type: 'model/gltf-binary' })
}

describe('persisted motion library', () => {
  it('imports binary animation, reloads metadata, and removes both records', async () => {
    const file = await fixture()
    const entry = await importMotion(file)
    importedIds.push(entry.id)
    const entries = await listImportedMotions()
    expect(entries.find(item => item.id === entry.id)?.name).toBe('Local relaxed idle')
    expect(entry.duration).toBe(48)
    expect((await readMotionBytes(entry.id)).byteLength).toBe(file.size)
    await removeMotion(entry.id)
    expect((await listImportedMotions()).some(item => item.id === entry.id)).toBe(false)
    await expect(readMotionBytes(entry.id)).rejects.toThrow('missing')
  })

  it('persists per-avatar idle choices without changing another avatar', async () => {
    const first = `test-avatar-${crypto.randomUUID()}`
    const second = `test-avatar-${crypto.randomUUID()}`
    await updateMotionPreferences(first, { idleId: 'relaxed-idle', aiEnabled: false })
    expect((await readMotionPreferences(first)).idleId).toBe('relaxed-idle')
    expect((await readMotionPreferences(first)).aiEnabled).toBe(false)
    expect((await readMotionPreferences(second)).idleId).toBe('default-idle')
    expect((await readMotionPreferences(second)).aiEnabled).toBe(true)
    await updateMotionPreferences(first, { idleId: 'default-idle' })
    expect((await readMotionPreferences(first)).idleId).toBe('default-idle')
  })

  it('invalidates metadata and preferences from a separate Eventa broadcast context', async () => {
    const pinia = createPinia()
    const channel = new BroadcastChannel('proj-airi:vrm-motions')
    const remote = createContext(channel)
    try {
      const store = useVrmMotionsStore(pinia)
      await store.load()
      const entry = await importMotion(await fixture())
      importedIds.push(entry.id)
      remote.context.emit(motionLibraryChanged, undefined)
      await expect.poll(() => store.imported.some(item => item.id === entry.id)).toBe(true)
      const avatar = `test-avatar-${crypto.randomUUID()}`
      await updateMotionPreferences(avatar, { idleId: entry.id })
      remote.context.emit(motionPreferencesChanged, { modelId: avatar })
      await expect.poll(() => store.preferences[avatar]?.idleId).toBe(entry.id)
    }
    finally {
      disposePinia(pinia)
      remote.dispose()
      channel.close()
    }
  })

  it('limits the model prompt to saved eligibility, with no asset URLs or missing IDs', () => {
    const preferences = defaultMotionPreferences()
    preferences.aiMotionIds = ['local-example', 'missing']
    const prompt = createMotionPrompt(preferences, [{ id: 'local-example', name: 'Wave', category: 'gesture', duration: 2, source: 'imported', loop: false }])
    expect(prompt).toContain('local-example')
    expect(prompt).not.toContain('missing')
    expect(prompt).not.toContain('blob:')
    preferences.aiEnabled = false
    expect(createMotionPrompt(preferences, [])).toBe('')
  })
})
