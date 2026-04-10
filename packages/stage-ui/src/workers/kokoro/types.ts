/**
 * Kokoro TTS domain types.
 *
 * Worker communication uses the unified protocol from protocol.ts.
 * These types define the domain-specific data structures (voices, etc.).
 */

import type { GenerateOptions } from 'kokoro-js'

export type VoiceKey = NonNullable<GenerateOptions['voice']>

export interface Voice {
  language: string
  name: string
  gender: string
}

export type Voices = Record<string, Voice>
