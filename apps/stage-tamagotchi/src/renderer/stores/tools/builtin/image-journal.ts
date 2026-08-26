import type { ResolvedArtistryConfig } from '@proj-airi/stage-ui/stores/modules/artistry'
import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { artistryGenerateHeadless, errorMessageFromValue } from '@proj-airi/stage-shared'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { resolveArtistryConfigFromStore, useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { rawTool } from '@xsai/tool'

import { widgetsAdd } from '../../../../shared/eventa'

type Invokers = ReturnType<typeof createInvokers>

export function getArtistryConfig(): ResolvedArtistryConfig {
  return resolveArtistryConfigFromStore(useArtistryStore())
}

function createInvokers() {
  const { context } = createContext(window.electron.ipcRenderer)
  return {
    addWidget: defineInvoke(context, widgetsAdd),
    generateHeadless: defineInvoke(context, artistryGenerateHeadless),
  }
}
let invokeCache: Invokers | undefined

function getInvokers(): Invokers {
  if (!invokeCache)
    invokeCache = createInvokers()
  return invokeCache
}

const imageJournalParams = {
  additionalProperties: false,
  properties: {
    action: {
      description: 'Choose "create" to generate a new image, or "apply" to use an existing one.',
      enum: ['create', 'apply'],
      type: 'string',
    },
    mode: {
      description: 'Display mode: "inline" (in chat), "widget" (overlay), "bg" (environment), or "bg_widget" (both). Defaults to character preference.',
      enum: ['inline', 'widget', 'bg', 'bg_widget', null],
      type: ['string', 'null'],
    },
    prompt: {
      description: 'Description for the image (required for "create").',
      type: ['string', 'null'],
    },
    query: {
      description: 'Search term for existing images (required for "apply").',
      type: ['string', 'null'],
    },
    title: {
      description: 'Label for the entry (optional).',
      type: ['string', 'null'],
    },
  },
  required: [
    'action',
    'prompt',
    'title',
    'query',
    'mode',
  ],
  type: 'object',
} satisfies JsonSchema

async function executeCreateImageJournalEntry(params: { mode?: 'bg' | 'bg_widget' | 'inline' | 'widget', prompt?: string, title?: string }) {
  if (!params.prompt?.trim())
    throw new Error('prompt is required for image_journal.create')

  const backgroundStore = useBackgroundStore()
  const cardStore = useAiriCardStore()
  const activeCard = cardStore.activeCard
  const globalArtistryConfig = getArtistryConfig()

  const airiExt = activeCard?.extensions?.airi
  const cardArtistry = airiExt?.modules?.artistry
  const artistryConfig = {
    globals: globalArtistryConfig.globals,
    model: cardArtistry?.model || globalArtistryConfig.model,
    options: cardArtistry?.options || globalArtistryConfig.options,
    promptPrefix: cardArtistry?.promptPrefix || globalArtistryConfig.promptPrefix,
    provider: cardArtistry?.provider || globalArtistryConfig.provider,
  }

  const title = params.title || `Generation ${new Date().toLocaleString()}`

  // Resolve mode: explicit param > character fallback > global default (inline)
  const spawnMode = cardArtistry?.spawnMode
  const mode = params.mode || spawnMode || 'inline'

  const { addWidget, generateHeadless } = getInvokers()

  try {
    const artistryResult = await generateHeadless({
      globals: JSON.parse(JSON.stringify(artistryConfig.globals || {})),
      model: artistryConfig.model as string,
      options: JSON.parse(JSON.stringify(artistryConfig.options || {})),
      prompt: artistryConfig.promptPrefix ? `${artistryConfig.promptPrefix} ${params.prompt}` : params.prompt as string,
      provider: artistryConfig.provider as string,
    })

    if (artistryResult.error || (!artistryResult.base64 && !artistryResult.imageUrl)) {
      throw new Error(`Failed to generate image: ${artistryResult.error || 'No output received'}`)
    }

    let blob: Blob
    if (artistryResult.base64) {
      const response = await fetch(artistryResult.base64)
      blob = await response.blob()
    }
    else {
      const response = await fetch(artistryResult.imageUrl!)
      blob = await response.blob()
    }

    const entryId = await backgroundStore.addBackground('journal', blob, title, params.prompt, cardStore.activeCardId)

    // Handle Application Logic based on Mode
    if (mode === 'bg' || mode === 'bg_widget') {
      const cardId = cardStore.activeCardId
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.airi)
            extension.airi = {}
          if (!extension.airi.modules)
            extension.airi.modules = {}
          extension.airi.modules.activeBackgroundId = entryId
          await cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
    }

    if (mode === 'widget' || mode === 'bg_widget') {
      try {
        await addWidget({
          componentName: 'artistry',
          componentProps: {
            _skipIngestion: true,
            entryId,
            imageUrl: artistryResult.imageUrl || artistryResult.base64,
            prompt: params.prompt as string,
            status: 'done',
            title,
          },
          size: 'm',
          ttlMs: 0,
        })
      }
      catch (e) {
        console.warn('[ImageJournalTool] Failed to spawn Result widget', e)
      }
    }

    // Return structured result for UI rendering
    return JSON.stringify({
      entryId,
      imageUrl: artistryResult.imageUrl || artistryResult.base64,
      message: `Image created in ${mode} mode${mode === 'bg' || mode === 'bg_widget' ? ' and set as background' : ''}.`,
      mode,
      prompt: params.prompt,
      title,
    })
  }
  catch (e) {
    console.error('[ImageJournalTool] Failed to create entry', e)
    return `Error: ${errorMessageFromValue(e)}`
  }
}

async function executeImageJournalAction(params: any) {
  if (params.action === 'create')
    return await executeCreateImageJournalEntry(params)
  if (params.action === 'apply' || params.action === 'set_as_background')
    return await executeSetAsBackground(params)
  return 'No action performed.'
}

async function executeSetAsBackground(params: { query?: string }) {
  if (!params.query?.trim())
    return 'Error: query is required for image_journal.apply. Provide a title or ID to search for.'

  const backgroundStore = useBackgroundStore()
  const cardStore = useAiriCardStore()
  const cardId = cardStore.activeCardId
  const query = params.query.toLowerCase().trim()

  const entries = Array.from(backgroundStore.entries.values())
    .filter(e => e.characterId === null || e.characterId === cardId)

  let entry = entries.find(e => e.type === 'journal' && (e.id === query || e.id.toLowerCase().includes(query)))
  if (!entry)
    entry = entries.find(e => e.type === 'journal' && e.title.toLowerCase().includes(query))
  if (!entry)
    entry = entries.find(e => e.type !== 'journal' && e.title.toLowerCase().includes(query))

  if (entry) {
    try {
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.airi)
            extension.airi = {}
          if (!extension.airi.modules)
            extension.airi.modules = {}
          extension.airi.modules.activeBackgroundId = entry.id
          await cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
      return `Background set to "${entry.title}".`
    }
    catch (e) {
      return `Error applying "${entry.title}": ${errorMessageFromValue(e)}`
    }
  }

  const available = entries.filter(e => e.type === 'journal').map(e => e.title).slice(0, 10)
  return `No match for "${params.query}".${available.length > 0 ? ` Try: ${available.join(', ')}` : ''}`
}

const tools: Promise<Tool>[] = [
  Promise.resolve(rawTool({
    description: 'Manage AI-generated images. Use "create" to generate and display images. An optional "mode" (inline, widget, bg, bg_widget) can override the default character routing preference. Use "apply" to switch to an existing image from the journal.',
    execute: params => executeImageJournalAction(params),
    name: 'image_journal',
    parameters: imageJournalParams,
  })),
]

export const imageJournalTools = async () => Promise.all(tools)
