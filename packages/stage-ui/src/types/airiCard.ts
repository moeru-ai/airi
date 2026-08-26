import type { Card } from '@proj-airi/ccc'

/** Character card normalized with the AIRI extension required by the runtime. */
export interface AiriCard extends Card {
  extensions: Card['extensions'] & {
    airi: AiriExtension
  }
}

/**
 * AIRI-specific runtime configuration embedded in a character card.
 *
 * The extension is persisted with the card. Editor surfaces must preserve
 * fields they do not own so independent runtime modules can evolve without
 * losing each other's configuration.
 */
export interface AiriExtension {
  agents: Record<string, {
    enabled?: boolean
    prompt: string
  }>

  modules: {
    activeBackgroundId?: string

    artistry?: {
      autonomousEnabled?: boolean
      autonomousTarget?: 'assistant' | 'user'
      autonomousThreshold?: number
      enabled?: boolean
      model?: string
      options?: Record<string, unknown>
      promptPrefix?: string
      provider?: string
      spawnMode?: 'bg' | 'bg_widget' | 'inline' | 'widget'
      widgetInstruction?: string
      workflowId?: string
    }

    consciousness: {
      model: string
      provider: string
    }

    /** ID from the display-models store. */
    displayModelId?: string

    live2d?: {
      file?: string
      source?: 'file' | 'url'
      url?: string
    }

    speech: {
      language?: string
      model: string
      pitch?: number

      provider: string
      rate?: number
      ssml?: boolean
      voice_id: string
    }
    vision: {
      model: string
      provider: string
    }

    vrm?: {
      file?: string
      source?: 'file' | 'url'
      url?: string
    }
  }
}
