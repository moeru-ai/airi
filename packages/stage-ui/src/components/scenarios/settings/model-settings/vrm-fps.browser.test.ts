import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'

it('persists VRM frame limits without changing the model view', async () => {
  const key = 'settings/stage-ui-three/max-fps'
  localStorage.removeItem(key)
  const { useModelStore } = await import('@proj-airi/stage-ui-three')
  const pinia = createPinia()
  setActivePinia(pinia)

  try {
    const model = useModelStore()
    const offset = { ...model.modelOffset }
    expect(model.maxFps).toBe(0)

    for (const limit of [30, 60, 0]) {
      model.maxFps = limit
      await nextTick()
      expect(localStorage.getItem(key)).toBe(String(limit))
      expect(model.modelOffset).toEqual(offset)
    }
  }
  finally {
    disposePinia(pinia)
    localStorage.removeItem(key)
  }
})
