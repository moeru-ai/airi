import type { InferOutput } from 'valibot'

import { array, minLength, object, optional, parse, pipe, string, trim } from 'valibot'

/**
 * One domain term that post-ASR matching can suggest.
 *
 * - `term`: the canonical name, for example `Sulfur Cube`.
 * - `writtenForms`: spellings that the transcript can contain, for example `硫方怪`. The first one is the suggested text.
 * - `pronunciations`: token sequences in the wake word model vocabulary, ARPAbet phones or pinyin initials and toned finals.
 * - `description`: one line that the conversation model reads only when the term matches.
 * - `source`: where the entry came from, for example a pack name or `llm-guess`.
 */
export const phoneticVocabularyEntrySchema = object({
  term: pipe(string(), trim(), minLength(1)),
  writtenForms: array(pipe(string(), trim(), minLength(1))),
  pronunciations: pipe(array(pipe(array(pipe(string(), minLength(1))), minLength(1))), minLength(1)),
  description: pipe(string(), trim()),
  source: pipe(string(), trim(), minLength(1)),
})

export type PhoneticVocabularyEntry = InferOutput<typeof phoneticVocabularyEntrySchema>

/**
 * An importable vocabulary pack, for example terms exported from a game wiki.
 * An entry can omit `pronunciations`. Import then derives them from the written forms.
 */
const vocabularyPackSchema = object({
  source: pipe(string(), trim(), minLength(1)),
  entries: array(object({
    term: pipe(string(), trim(), minLength(1)),
    writtenForms: array(pipe(string(), trim(), minLength(1))),
    pronunciations: optional(array(pipe(array(pipe(string(), minLength(1))), minLength(1)))),
    description: pipe(string(), trim()),
  })),
})

export type VocabularyPack = InferOutput<typeof vocabularyPackSchema>

/** Validates a vocabulary pack and keeps it as written, without derived pronunciations. Throws when it is not valid. */
export function parseVocabularyPack(value: unknown): VocabularyPack {
  return parse(vocabularyPackSchema, value)
}

/**
 * Validates a vocabulary pack and returns its entries with the pack source.
 *
 * Given pronunciations must use only tokens of `vocabulary`, so packs share the wake word model token space.
 * `pronounce` derives missing or empty pronunciations from the written forms. An entry without any pronunciation is dropped,
 * because matching cannot reach it.
 */
export function importVocabularyPack(value: unknown, options: { vocabulary: ReadonlySet<string>, pronounce: (text: string) => readonly string[] | undefined }): PhoneticVocabularyEntry[] {
  const pack = parseVocabularyPack(value)
  return pack.entries.flatMap((entry) => {
    if (entry.pronunciations?.some(tokens => tokens.some(token => !options.vocabulary.has(token))))
      throw new Error(`Pronunciation of "${entry.term}" does not match the model vocabulary`)

    const pronunciations = entry.pronunciations?.length
      ? entry.pronunciations
      : entry.writtenForms.flatMap((form) => {
          const tokens = options.pronounce(form)
          return tokens ? [[...tokens]] : []
        })
    if (!pronunciations.length)
      return []
    return [parse(phoneticVocabularyEntrySchema, { ...entry, pronunciations, source: pack.source })]
  })
}
