import type { Card } from '@proj-airi/ccc'

/** A pronunciation that the selected KWS model can recognize. */
export interface WakeWordMatch {
  tokens: string[]
  score?: number
  threshold?: number
}

/** A spoken name and every pronunciation that can trigger the character. */
export interface WakeWordKeyword {
  label: string
  matches: WakeWordMatch[]
  score?: number
  threshold?: number
}

/** Wake words travel with the character card; conflict ownership does not. */
export interface WakeWordsConfig {
  keywords: WakeWordKeyword[]
}

/**
 * AIRI-specific runtime configuration embedded in a character card.
 *
 * The extension is persisted with the card. Editor surfaces must preserve
 * fields they do not own so independent runtime modules can evolve without
 * losing each other's configuration.
 */
export interface AiriExtension {
  modules: {
    consciousness: {
      provider: string
      model: string
    }

    vision: {
      provider: string
      model: string
    }

    speech: {
      provider: string
      model: string
      voice_id: string

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
    }

    /** ID from the display-models store. */
    displayModelId?: string
    activeBackgroundId?: string

    wakeWords?: WakeWordsConfig

    artistry?: {
      enabled?: boolean
      provider?: string
      model?: string
      promptPrefix?: string
      workflowId?: string
      widgetInstruction?: string
      spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget'
      options?: Record<string, unknown>
      autonomousEnabled?: boolean
      autonomousThreshold?: number
      autonomousTarget?: 'user' | 'assistant'
    }
  }

  agents: Record<string, {
    prompt: string
    enabled?: boolean
  }>
}

/** Character card normalized with the AIRI extension required by the runtime. */
export interface AiriCard extends Card {
  extensions: {
    airi: AiriExtension
  } & Card['extensions']
}
