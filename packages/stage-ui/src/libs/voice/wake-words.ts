import type { InferOutput } from 'valibot'

import { array, minLength, object, parse, pipe, string, trim } from 'valibot'

/** Cards carry model vocabulary identity and every configured pronunciation. Device ownership stays outside the card. */
export const wakeWordSchema = object({
  text: pipe(string(), trim(), minLength(1)),
  modelId: pipe(string(), trim(), minLength(1)),
  pronunciations: pipe(array(pipe(array(pipe(string(), minLength(1))), minLength(1))), minLength(1)),
})

/** A card stores the written word and the model-specific token pronunciations. */
export type WakeWord = InferOutput<typeof wakeWordSchema>

/** One character's pronunciation after the card and model identifiers are combined. */
export interface WakePronunciation {
  readonly key: string
  readonly modelId: string
  readonly tokens: readonly string[]
  readonly characterId: string
  readonly text: string
}

/** Conflicting pronunciations remain unresolved until the device selects an owner. */
export interface WakeWordConflict {
  readonly key: string
  readonly candidates: readonly WakePronunciation[]
  readonly owner?: string
}

/** A pronunciation has at most one active owner. Unresolved conflicts pause only the matching pronunciation. */
export function resolveWakeWords(cards: readonly { characterId: string, words: readonly WakeWord[] }[], owners: Readonly<Record<string, string>>) {
  const groups = new Map<string, Map<string, WakePronunciation>>()
  for (const card of cards) {
    for (const word of card.words) {
      for (const tokens of word.pronunciations) {
        const key = JSON.stringify([word.modelId, tokens])
        const group = groups.get(key) ?? new Map<string, WakePronunciation>()
        group.set(card.characterId, { key, characterId: card.characterId, text: word.text, modelId: word.modelId, tokens })
        groups.set(key, group)
      }
    }
  }
  const active: WakePronunciation[] = []
  const conflicts: WakeWordConflict[] = []
  for (const [key, group] of groups) {
    if (group.size === 1) {
      active.push([...group.values()][0])
      continue
    }
    const owner = group.get(owners[key])
    conflicts.push({ key, candidates: [...group.values()], owner: owner?.characterId })
    if (owner)
      active.push(owner)
  }
  return { active, conflicts }
}

/** The keyword adapter supplies the selected model's vocabulary. Invalid model tokens never change the card. */
export function validateWakeWords(value: unknown, model: { id: string, vocabulary: ReadonlySet<string> }): WakeWord[] {
  const words = parse(array(wakeWordSchema), value)
  for (const word of words) {
    if (word.modelId !== model.id || word.pronunciations.some(tokens => tokens.some(token => !model.vocabulary.has(token))))
      throw new Error('Wake word pronunciation does not match the selected model vocabulary')
  }
  return words
}
