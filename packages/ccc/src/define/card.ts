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
   * Example message.
   * - mes_example
   */
  messageExample?: Message[][]
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

/**
 * Moeru-AI Character Card
 */
export type Card = CardAdditional & CardCore & CardDescription & CardMeta

export type CardFn<T extends Record<string, unknown> = Record<string, unknown>> = (data: T) => Card

export const defineCard = (card: Card) => card

export const defineCardFn = <T extends Record<string, unknown> = Record<string, unknown>>(card: CardFn<T>, data: T) => card(data)
