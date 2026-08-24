import * as v from 'valibot'

/**
 * Part of speech, spelled the way Crowdin spells it.
 *
 * NOTICE:
 * TBX-Basic writes this value as `properNoun` (DC-0396), and Crowdin writes it as "proper
 * noun" with a space. Crowdin reads what we upload, so Crowdin wins. Confirmed against a
 * glossary exported from project 816610, where every proper noun reads "proper noun".
 */
const PartOfSpeechSchema = v.picklist([
  'adjective',
  'adposition',
  'adverb',
  'auxiliary',
  'coordinating conjunction',
  'determiner',
  'interjection',
  'noun',
  'numeral',
  'particle',
  'pronoun',
  'proper noun',
  'subordinating conjunction',
  'verb',
  'other',
])

/** Term type. TBX-Basic allows these values and no others (DC-2677). */
const TermTypeSchema = v.picklist(['fullForm', 'acronym', 'abbreviation', 'shortForm', 'variant', 'phrase'])

/**
 * How acceptable a term is (DC-0070). ISO 704:2022 calls it an acceptability rating.
 *
 * These are the readable forms. The generator maps them to the suffixed values Crowdin
 * writes, such as `preferredTerm-admn-sts`. Crowdin permits more than one preferred term in
 * a concept, so nothing here limits the count.
 */
const UsageStatusSchema = v.picklist(['preferred', 'admitted', 'deprecated'])

/** Grammatical gender (DC-0245). */
const GenderSchema = v.picklist(['masculine', 'feminine', 'neuter', 'other'])

/**
 * One term of a concept.
 *
 * Every field maps to one TBX element, and the field names follow TBX rather than any name
 * of our own, so that the mapping stays obvious:
 *
 *   text           -> <term>
 *   part-of-speech -> <termNote type="partOfSpeech">
 *   status         -> <termNote type="administrativeStatus">
 *   type           -> <termNote type="termType">
 *   gender         -> <termNote type="grammaticalGender">
 *   context        -> <descrip type="context">
 *   note           -> <note>
 */
const TermSchema = v.object({
  'text': v.pipe(v.string(), v.nonEmpty()),
  'part-of-speech': PartOfSpeechSchema,
  'status': UsageStatusSchema,
  'type': v.optional(TermTypeSchema),
  'gender': v.optional(GenderSchema),
  /** A sentence that shows the term in use. TBX allows a context at term level only. */
  'context': v.optional(v.string()),
  'note': v.optional(v.string()),
})

/**
 * One concept, which is one entry of the glossary.
 *
 * As with a term, every field maps to one TBX element:
 *
 *   id           -> <conceptEntry id="...">
 *   subject      -> <descrip type="subjectField">
 *   translatable -> <descrip type="translatable">, a Crowdin extension
 *   definition   -> <descrip type="definition">
 *   note         -> <note>
 *   url          -> <xref type="externalCrossReference">
 *   terms        -> <langSec xml:lang="en"> with one <termSec> for each term
 */
const ConceptSchema = v.object({
  /**
   * Stable identifier in kebab case. A change here creates a new concept in Crowdin rather
   * than updating the existing one, so it must survive a rename of the terms.
   */
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab case')),
  subject: v.pipe(v.string(), v.nonEmpty()),
  translatable: v.boolean(),
  /** One sentence. Write two only when one cannot carry the meaning. */
  definition: v.pipe(v.string(), v.nonEmpty()),
  note: v.optional(v.string()),
  url: v.optional(v.pipe(v.string(), v.url())),
  terms: v.pipe(v.array(TermSchema), v.minLength(1)),
})

export const GlossarySchema = v.pipe(
  v.array(ConceptSchema),
  v.minLength(1),
  v.check(
    concepts => new Set(concepts.map(c => c.id)).size === concepts.length,
    'every concept id must be unique',
  ),
)

export type Term = v.InferOutput<typeof TermSchema>
export type Concept = v.InferOutput<typeof ConceptSchema>

/**
 * Parses and validates the contents of `terms.yaml`.
 *
 * Throws a `ValiError` naming the failing path when the data does not match, so a broken
 * entry fails the build rather than producing invalid TBX.
 *
 * @param data The result of parsing the YAML file.
 */
export function parseGlossary(data: unknown): Concept[] {
  return v.parse(GlossarySchema, data)
}
