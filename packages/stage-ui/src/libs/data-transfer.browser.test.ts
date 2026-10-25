import type { DataImportAdapter } from './data-transfer'

import { expect, it, vi } from 'vitest'

import { importData } from './data-transfer'

it('restores the captured snapshot when applying an import fails', async () => {
  let state = 'before'
  const adapter: DataImportAdapter<string, string, string> = {
    decode: async file => await file.text(),
    validate: async value => value,
    apply: async (value) => {
      state = value
      if (value === 'after')
        throw new Error('apply failed')
    },
    rollback: {
      capture: vi.fn(async () => state),
      restore: vi.fn(async (snapshot) => {
        state = snapshot
      }),
    },
  }

  await expect(importData(adapter, new File(['after'], 'settings.json'))).rejects.toThrow('apply failed')

  expect(state).toBe('before')
  expect(adapter.rollback?.capture).toHaveBeenCalledOnce()
  expect(adapter.rollback?.restore).toHaveBeenCalledOnce()
})

it('does not restore the snapshot after a successful import', async () => {
  let state = 'before'
  const restore = vi.fn(async (snapshot: string) => {
    state = snapshot
  })
  const adapter: DataImportAdapter<string, string, string> = {
    decode: async file => await file.text(),
    validate: async value => value,
    apply: async (value) => {
      state = value
    },
    rollback: {
      capture: async () => state,
      restore,
    },
  }

  await importData(adapter, new File(['after'], 'settings.json'))

  expect(state).toBe('after')
  expect(restore).not.toHaveBeenCalled()
})
