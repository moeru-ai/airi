import type { ccv3 } from '@proj-airi/ccc'

import type { AiriCard, AiriExtension } from '../types/airiCard'

import JSZip from 'jszip'

import { exportToJSON } from '@proj-airi/ccc'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from '../stores/display-models'
import { exportAiriCardPackage, importAiriCardPackage } from './airi-card-import-export'

describe('airi card package import/export', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('exports shareable fields, sanitizes runtime state, and restores display models', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const fetch = vi.fn(async () => new Response('preset-vrm-model'))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue({
      format: DisplayModelFormat.VRM,
      id: 'preset-vrm-1',
      importedAt: 1,
      name: 'AvatarSample_A',
      type: 'url' as const,
      url: '/assets/avatar.vrm',
    })
    mockAddDisplayModel(displayModelsStore, 'display-model-imported')

    const exported = await exportAiriCardPackage({ card: createCard(), displayModelsStore })
    const zip = await JSZip.loadAsync(await exported.arrayBuffer())
    const cardJson = await readJson<ccv3.CharacterCardV3>(zip, 'card.json')
    const imported = await importAiriCardPackage({ displayModelsStore, file: new File([exported], 'card.zip') })
    const airi = airiFrom(cardJson)

    expect(fetch).toHaveBeenCalledWith('/assets/avatar.vrm')
    expect(await readJson(zip, 'manifest.json')).toMatchObject({ format: 'airi-character-card', resources: { displayModel: { format: DisplayModelFormat.VRM, name: 'AvatarSample_A.vrm', path: 'models/body-model.vrm' } }, version: 1 })
    expect(await zip.file('models/body-model.vrm')?.async('string')).toBe('preset-vrm-model')
    expect(cardJson.data).toMatchObject({ creator: '', mes_example: '', name: 'AIRI / Test Card', tags: [] })
    expect(airi.modules).toMatchObject({ consciousness: { model: 'gpt-4o', provider: 'openai' }, speech: { model: 'eleven', provider: 'elevenlabs', voice_id: 'alloy' } })
    expect(airi.modules).not.toHaveProperty('activeBackgroundId')
    expect(airi.modules.artistry).not.toHaveProperty('workflowId')
    expect(airi.agents).toEqual({})
    expect(displayModelsStore.addDisplayModel).toHaveBeenCalledWith(DisplayModelFormat.VRM, expect.objectContaining({ name: 'AvatarSample_A.vrm' }))
    expect(airiFrom(imported).modules.displayModelId).toBe('display-model-imported')
  })

  it('applies the share-field whitelist to externally edited package JSON', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const source = exportToJSON(createCard('preset-live2d-1'))
    source.data.extensions.third_party = { token: 'do-not-import' }

    const imported = await importAiriCardPackage({
      displayModelsStore,
      file: await packageFile(source),
    })
    const airi = airiFrom(imported)

    expect(imported.data).toMatchObject({
      character_version: '1.2.3',
      creator: '',
      description: 'Description',
      mes_example: '',
      name: 'AIRI / Test Card',
      nickname: 'Tester',
      tags: [],
    })
    expect(imported.data.extensions).not.toHaveProperty('third_party')
    expect(airi.modules).not.toHaveProperty('activeBackgroundId')
    expect(airi.modules.artistry).not.toHaveProperty('workflowId')
    expect(airi.agents).toEqual({})
  })

  it('classifies invalid packages', async () => {
    const emptyZip = new JSZip()
    const invalidJsonZip = new JSZip()
    const displayModelsStore = useDisplayModelsStore()
    invalidJsonZip.file('manifest.json', '{')
    const cases = [
      [new File(['not zip'], 'card.zip'), { code: 'invalid-file', message: 'Invalid zip file' }],
      [new File([await emptyZip.generateAsync({ type: 'arraybuffer' })], 'empty.zip'), { code: 'missing-file' }],
      [new File([await invalidJsonZip.generateAsync({ type: 'arraybuffer' })], 'invalid-json.zip'), { cause: expect.any(SyntaxError), code: 'invalid-file' }],
      [await packageFile(exportToJSON(createCard()), { version: 2 }), { code: 'invalid-file' }],
    ] as const

    for (const [file, expected] of cases)
      await expect(importAiriCardPackage({ displayModelsStore, file })).rejects.toMatchObject(expected)
  })

  it('preserves Tachie archives and their compound extension', async () => {
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue({
      file: new File(['tachie-model'], 'character.tachie.zip'),
      format: DisplayModelFormat.TachieZip,
      id: 'tachie-model',
      importedAt: 1,
      name: 'character.tachie.zip',
      type: 'file',
    })
    mockAddDisplayModel(displayModelsStore, 'imported-tachie')

    const exported = await exportAiriCardPackage({
      card: createCard('tachie-model'),
      displayModelsStore,
    })
    const zip = await JSZip.loadAsync(await exported.arrayBuffer())
    const imported = await importAiriCardPackage({
      displayModelsStore,
      file: new File([exported], 'card.zip'),
    })

    expect(await readJson(zip, 'manifest.json')).toMatchObject({
      resources: {
        displayModel: {
          format: DisplayModelFormat.TachieZip,
          name: 'character.tachie.zip',
          path: 'models/body-model.tachie.zip',
        },
      },
    })
    expect(await zip.file('models/body-model.tachie.zip')?.async('string')).toBe('tachie-model')
    expect(displayModelsStore.addDisplayModel).toHaveBeenCalledWith(
      DisplayModelFormat.TachieZip,
      expect.objectContaining({ name: 'character.tachie.zip' }),
    )
    expect(airiFrom(imported).modules.displayModelId).toBe('imported-tachie')
  })
})

function airiFrom(card: ccv3.CharacterCardV3): AiriExtension {
  return card.data.extensions.airi as AiriExtension
}

function createCard(displayModelId = 'preset-vrm-1'): AiriCard {
  return {
    creator: 'Hidden creator',
    description: 'Description',
    extensions: {
      airi: {
        agents: { minecraft: { enabled: true, prompt: 'secret' } },
        modules: {
          activeBackgroundId: 'background-secret',
          artistry: { model: 'flux', provider: 'replicate', workflowId: 'workflow-secret' },
          consciousness: { model: 'gpt-4o', provider: 'openai' },
          displayModelId,
          speech: { model: 'eleven', pitch: 1, provider: 'elevenlabs', voice_id: 'alloy' },
          vision: { model: 'llava', provider: 'ollama' },
        },
      },
    },
    messageExample: [['{{user}}: hidden']],
    name: 'AIRI / Test Card',
    nickname: 'Tester',
    tags: ['hidden'],
    version: '1.2.3',
  }
}

function mockAddDisplayModel(store: ReturnType<typeof useDisplayModelsStore>, id = 'unused') {
  return vi.spyOn(store, 'addDisplayModel').mockImplementation(async (format, file) => ({
    file,
    format,
    id,
    importedAt: 1,
    name: file.name,
    type: 'file' as const,
  }))
}

async function packageFile(cardJson: ccv3.CharacterCardV3, manifestOverrides: Record<string, unknown> = {}) {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({
    card: { path: 'card.json', spec: 'chara_card_v3' },
    format: 'airi-character-card',
    version: 1,
    ...manifestOverrides,
  }))
  zip.file('card.json', JSON.stringify(cardJson))
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'card.zip')
}

async function readJson<T = Record<string, unknown>>(zip: JSZip, path: string): Promise<T> {
  return JSON.parse(await zip.file(path)!.async('string')) as T
}
