export interface CharacterBook {
  description?: string
  entries: CharacterBookEntry[]
  extensions: CharacterBookExtensions
  name?: string
  recursive_scanning?: boolean
  scan_depth?: number
  token_budget?: number
}

export interface CharacterBookEntry {
  case_sensitive?: boolean
  /** not used in prompt engineering */
  comment?: string
  /** if true, always inserted in the prompt (within budget limit) */
  constant?: boolean
  content: string
  enabled: boolean
  extensions: CharacterBookEntryExtensions

  // FIELDS WITH NO CURRENT EQUIVALENT IN SILLY
  /** not used in prompt engineering */
  id?: number
  /** if two entries inserted, lower "insertion order" = inserted higher */
  insertion_order: number

  // FIELDS WITH NO CURRENT EQUIVALENT IN AGNAI
  keys: string[]
  /** not used in prompt engineering */
  name?: string
  /** whether the entry is placed before or after the character defs */
  position?: 'after_char' | 'before_char'
  /** if token budget reached, lower priority value = discarded first */
  priority?: number
  /** see field `selective`. ignored if selective == false */
  secondary_keys?: string[]
  /** if `true`, require a key from both `keys` and `secondary_keys` to trigger the entry */
  selective?: boolean
}

export interface CharacterBookExtensions extends Record<string, unknown> {}

export interface CharacterBookEntryExtensions extends Record<string, unknown> {}
