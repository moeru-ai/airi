import type { Data } from '../export/types'
import type { Message } from './types/mes_example'

interface CardCore {
  creator?: Data['creator']
  name: Data['name']
  /**
   * Nickname
   * @see {@link https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#nickname}
   */
  nickname?: Data['nickname']
  version: Data['character_version']
}

interface CardMeta {
  /**
   * Metadata.
   *
   * @example
   * ```ts
   * {
   *   metadata: {
   *     avatar: 'https://example.com/avatar.png',
   *     foo: 721,
   *     moetalk: true,
   *   }
   * }
   * ```
   */
  metadata?: Record<string, boolean | number | string>
}

interface CardAdditional {
  /**
   * Extensions.
   * - extensions
   */
  extensions?: Data['extensions']
  /**
   * First message and alternate greetings.
   *
   * `greetings[0]` - first_mes
   *
   * `greetings.slice(1)` - alternate_greetings
   */
  greetings?: string[]
  /**
   * Group Only Greetings.
   * - group_only_greetings
   */
  greetingsGroupOnly?: string[]
  /**
   * creator_notes
   * @see {@link https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#creator_notes}
   */
  notes?: Data['creator_notes']
  /**
   * creator_notes_multilingual
   * @see {@link https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#creator_notes_multilingual}
   */
  notesMultilingual?: Data['creator_notes_multilingual']
}

interface CardDescription {
  /**
   * @experimental
   * TODO: FIXME: remove this
   */
  description?: string
}

interface CardExtra {
  /**
   * Character's personality traits and behavioral patterns
   * Used to define how the character should act and respond
   */
  personality?: string

  /**
   * Background context and setting for the character
   * Provides the environment and situation the character exists in
   */
  scenario?: string

  /**
   * Core system instructions for the character's behavior
   * Defines fundamental rules and context for the AI model
   */
  systemPrompt?: string

  /**
   * Instructions to process after chat history
   * Helps maintain character consistency across conversations
   */
  postHistoryInstructions?: string

  /**
   * Categorization labels for the character
   * Used for filtering and organization
   */
  tags?: string[]

  /**
   * Sample conversation snippets showing character interactions
   * Demonstrates expected conversation patterns
   */
  messageExample?: Message[][]
}

/**
 * Moeru-AI Character Card
 */
export type Card = CardAdditional & CardCore & CardDescription & CardMeta & CardExtra

export type CardFn<T extends Record<string, unknown> = Record<string, unknown>> = (data: T) => Card

export const defineCard = (card: Card) => card

export const defineCardFn = <T extends Record<string, unknown> = Record<string, unknown>>(card: CardFn<T>, data: T) => card(data)
