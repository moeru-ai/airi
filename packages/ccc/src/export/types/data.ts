import type { Assets } from './assets'
import type { CharacterBook } from './character_book'
import type { Extensions } from './extensions'

/** @see {@link https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#charactercard-object} */
export type Data = DataV1 & DataV2 & DataV3

/** @see {@link https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v1.md} */
export interface DataV1 {
  description: string
  first_mes: string
  mes_example: string
  name: string
  personality: string
  scenario: string
}

/** @see {@link https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md} */
export interface DataV2 {
  alternate_greetings: string[]
  character_book?: CharacterBook
  character_version: string
  creator: string
  creator_notes: string
  extensions: Extensions
  post_history_instructions: string
  system_prompt: string
  tags: string[]
}

/** @see {@link https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#charactercard-object} */
export interface DataV3 {
  assets?: Assets
  creation_date?: number
  creator_notes_multilingual?: Record<string, string>
  group_only_greetings: string[]
  modification_date?: number
  nickname?: string
  source?: string[]
}
