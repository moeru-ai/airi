import type { Card } from '@moeru-ai/ccc'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export interface CharacterCardV2 {
  spec: string
  spec_version: string
  data: {
    name: string
    description: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    creator_notes?: string
    system_prompt?: string
    post_history_instructions?: string
    alternate_greetings?: string[]
    character_book?: any
    tags?: string[]
    creator?: string
    character_version?: string
    extensions?: any
  }
}

export interface AiriCard extends Card {
  modules?: {
    consciousness?: {
      model?: string // Example: "gpt-4o"
    }

    speech?: {
      model?: string // Example: "eleven_multilingual_v2"
      voice_id?: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
    }
  }

  agents?: {
    [key: string]: { // example: minecraft
      prompt: string
    }
  }

  // Character card data fields
  prompt?: string // Character system prompt or first message
  tags?: string[] // Character tags

  // Extension fields for storing original data
  extensions?: {
    personality?: string
    scenario?: string
    first_mes?: string
    creator_notes?: string
    post_history_instructions?: string
    character_book?: any
    alternate_greetings?: string[]
    [key: string]: unknown
  }
}

export const useAiriCardStore = defineStore('airi-card', () => {
  // Storage keys
  const STORAGE_PREFIX = 'settings/airi-card'
  const STORAGE_KEYS = {
    cards: `${STORAGE_PREFIX}/cards`,
    cardsRaw: `${STORAGE_PREFIX}/cards-raw`,
    activeCard: `${STORAGE_PREFIX}/active-card`,
  }

  // Default card configuration
  const DEFAULT_CARD_ID = 'default'
  const DEFAULT_CARD: AiriCard = {
    name: 'ReLU',
    description: 'ReLU is a powerful AI agent that can help you with your tasks.',
    version: '1.0.0',
    models: {
      consciousness: 'gpt-4o',
      voice: 'alloy',
    },
  }
  const DEFAULT_CARD_RAW = JSON.stringify({
    name: 'ReLU',
    description: 'ReLU is a powerful AI agent that can help you with your tasks.',
    version: '1.0.0',
  })

  // State
  const cards = ref<Map<string, AiriCard>>(new Map())
  const cardsRaw = ref<Map<string, string>>(new Map())
  const activeCardId = useLocalStorage(STORAGE_KEYS.activeCard, DEFAULT_CARD_ID)

  // Persistence
  const storedCards = useLocalStorage<Map<string, AiriCard>>(STORAGE_KEYS.cards, new Map())
  const storedCardsRaw = useLocalStorage<Map<string, string>>(STORAGE_KEYS.cardsRaw, new Map())

  // Initialize state from storage
  cards.value = new Map(storedCards.value)
  cardsRaw.value = new Map(storedCardsRaw.value)

  // Sync changes to storage
  watch(cards, (newCards) => {
    storedCards.value = new Map(newCards)
  }, { deep: true })

  watch(cardsRaw, (newCardsRaw) => {
    storedCardsRaw.value = new Map(newCardsRaw)
  }, { deep: true })

  // Initialize with default card if needed
  if (!cards.value.has(DEFAULT_CARD_ID)) {
    cards.value.set(DEFAULT_CARD_ID, DEFAULT_CARD)
    cardsRaw.value.set(DEFAULT_CARD_ID, DEFAULT_CARD_RAW)
  }

  // Computed properties
  const activeCard = computed(() => cards.value.get(activeCardId.value))
  const activeCardRaw = computed(() => cardsRaw.value.get(activeCardId.value))

  // Set default active card if needed
  if (cards.value.has(DEFAULT_CARD_ID)) {
    activeCardId.value = DEFAULT_CARD_ID
  }

  /**
   * Sets the active card by ID
   * Falls back to default card if ID doesn't exist
   */
  const setActiveCard = (id: string): void => {
    if (cards.value.has(id)) {
      activeCardId.value = id
    }
    else if (cards.value.has(DEFAULT_CARD_ID)) {
      activeCardId.value = DEFAULT_CARD_ID
    }
    else {
      activeCardId.value = DEFAULT_CARD_ID
    }
  }

  /**
   * Creates a new card and returns its ID
   */
  const createCard = (card: Omit<AiriCard, 'id'>, rawJson?: string): string => {
    const id = crypto.randomUUID()
    cards.value.set(id, card)

    if (rawJson) {
      cardsRaw.value.set(id, rawJson)
    }
    return id
  }

  /**
   * Removes a card by ID
   * Resets to default card if the active card is removed
   */
  const removeCard = (id: string): void => {
    cards.value.delete(id)
    cardsRaw.value.delete(id)

    if (activeCardId.value === id) {
      setActiveCard(DEFAULT_CARD_ID)
    }
  }

  /**
   * Exports a card's raw JSON by ID
   */
  const exportCard = (id: string): string | null => {
    return cardsRaw.value.get(id) || null
  }

  /**
   * Parses a CharacterCardV2 format into AiriCard format
   */
  const parseCharacterCardV2 = (data: CharacterCardV2['data'], specVersion: string): Omit<AiriCard, 'id'> => {
    if (!data.name) {
      throw new Error('Missing required field: name')
    }

    // Combine description with personality and scenario
    let combinedDescription = data.description || ''
    if (data.personality) {
      combinedDescription += `\n\n**Personality:**\n${data.personality}`
    }
    if (data.scenario) {
      combinedDescription += `\n\n**Scenario:**\n${data.scenario}`
    }

    // Create extensions object
    const extensions = {
      personality: data.personality || '',
      scenario: data.scenario || '',
      first_mes: data.first_mes || '',
      creator_notes: data.creator_notes || '',
      post_history_instructions: data.post_history_instructions || '',
      character_book: data.character_book || null,
      alternate_greetings: data.alternate_greetings || [],
    }

    return {
      name: data.name,
      description: combinedDescription,
      version: data.character_version || specVersion || '1.0.0',
      prompt: data.system_prompt || data.first_mes || '',
      tags: data.tags || [],
      extensions,
      models: {
        consciousness: 'gpt-4o',
        voice: 'alloy',
      },
    }
  }

  /**
   * Parses a simple card format into AiriCard format
   */
  const parseSimpleCard = (jsonData: any): Omit<AiriCard, 'id'> => {
    if (!jsonData.name) {
      throw new Error('Missing required field: name')
    }

    return {
      name: jsonData.name,
      description: jsonData.description || '',
      version: jsonData.version || '1.0.0',
      prompt: jsonData.prompt || jsonData.system_prompt || '',
      tags: jsonData.tags || [],
      models: {
        consciousness: 'gpt-4o',
        voice: 'alloy',
      },
    }
  }

  /**
   * Imports a card from JSON string
   * Returns the new card ID or null if import fails
   */
  const importCardJson = (json: string): string | null => {
    try {
      const jsonData = JSON.parse(json)
      let cardData: Omit<AiriCard, 'id'>

      // Handle different card formats
      if (jsonData.spec === 'chara_card_v2' && jsonData.data) {
        cardData = parseCharacterCardV2(jsonData.data, jsonData.spec_version)
      }
      else {
        cardData = parseSimpleCard(jsonData)
      }

      // Create and return the new card ID
      return createCard(cardData, json)
    }
    catch (error) {
      console.error('Failed to parse JSON:', error)
      return null
    }
  }

  return {
    cards,
    cardsRaw,
    activeCard,
    activeCardRaw,
    createCard,
    removeCard,
    setActiveCard,
    exportCard,
    importCardJson,
  }
})
