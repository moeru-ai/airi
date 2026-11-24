import { modelScopedStorageKey, removeDisplayModelSettings, setActiveDisplayModelForSettings } from '@proj-airi/stage-shared/composables'
import { createPinia, disposePinia } from 'pinia'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useSettingsLive2d } from './live2d'

it('receives mapping choices from another window and restores each model choice', async () => {
  const modelA = 'input-mapping-storage-model-a'
  const modelB = 'input-mapping-storage-model-b'
  const keyA = modelScopedStorageKey(modelA, 'settings/live2d/input-mapping-mode')
  const keyB = modelScopedStorageKey(modelB, 'settings/live2d/input-mapping-mode')
  const pinia = createPinia()
  const settings = useSettingsLive2d(pinia)
  const otherWindow = document.createElement('iframe')
  const storageChanges: Array<{ key: string | null, value: string | null }> = []
  const receiveStorage = (event: StorageEvent) => {
    if (event.key === keyA || event.key === keyB)
      storageChanges.push({ key: event.key, value: event.newValue })
  }
  window.addEventListener('storage', receiveStorage)

  // An about:blank frame inherits the origin but owns a separate Window and its native storage events.
  const frameLoaded = new Promise<void>(resolve => otherWindow.addEventListener('load', () => resolve(), { once: true }))
  otherWindow.src = 'about:blank'
  document.body.append(otherWindow)
  await frameLoaded
  const remoteStorage = otherWindow.contentWindow?.localStorage
  if (!remoteStorage)
    throw new Error('The second window did not expose its same-origin storage.')

  try {
    setActiveDisplayModelForSettings('live2d', modelA)
    await nextTick()
    expect(settings.live2dInputMappingMode).toBe('default')

    remoteStorage.setItem(keyA, 'model')
    await expect.poll(() => settings.live2dInputMappingMode).toBe('model')
    await expect.poll(() => storageChanges.at(-1)).toEqual({ key: keyA, value: 'model' })

    setActiveDisplayModelForSettings('live2d', modelB)
    await nextTick()
    expect(settings.live2dInputMappingMode).toBe('default')

    remoteStorage.setItem(keyB, 'model')
    await expect.poll(() => settings.live2dInputMappingMode).toBe('model')
    await expect.poll(() => storageChanges.at(-1)).toEqual({ key: keyB, value: 'model' })

    remoteStorage.setItem(keyA, 'default')
    await expect.poll(() => storageChanges.at(-1)).toEqual({ key: keyA, value: 'default' })
    expect(settings.live2dInputMappingMode).toBe('model')

    setActiveDisplayModelForSettings('live2d', modelA)
    await nextTick()
    expect(settings.live2dInputMappingMode).toBe('default')

    setActiveDisplayModelForSettings('live2d', modelB)
    await nextTick()
    expect(settings.live2dInputMappingMode).toBe('model')
    settings.live2dInputMappingMode = 'default'
    await nextTick()
    expect(remoteStorage.getItem(keyB)).toBe('default')
  }
  finally {
    window.removeEventListener('storage', receiveStorage)
    otherWindow.remove()
    setActiveDisplayModelForSettings('live2d', '')
    await nextTick()
    removeDisplayModelSettings(modelA)
    removeDisplayModelSettings(modelB)
    disposePinia(pinia)
  }
})
