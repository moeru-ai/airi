import type { InferOutput } from 'valibot'

import { array, boolean, finite, integer, isoTimestamp, maxLength, minLength, minValue, nullable, number, optional, picklist, pipe, record, regex, strictObject, string } from 'valibot'

const text = pipe(string(), maxLength(100_000))
const selection = pipe(string(), maxLength(1024))
const modelSelection = strictObject({ provider: selection, model: selection })
const numeric = pipe(number(), finite())

/** Portable private persona and selections. Credentials and device-local configuration are not admitted. */
export const CharacterDocumentSchema = strictObject({
  name: pipe(string(), minLength(1), maxLength(256)),
  version: selection,
  creator: optional(selection),
  nickname: optional(selection),
  description: optional(text),
  personality: optional(text),
  scenario: optional(text),
  systemPrompt: optional(text),
  postHistoryInstructions: optional(text),
  notes: optional(text),
  tags: optional(pipe(array(selection), maxLength(100))),
  greetings: optional(pipe(array(text), maxLength(100))),
  extensions: strictObject({
    airi: strictObject({
      modules: strictObject({
        consciousness: modelSelection,
        vision: modelSelection,
        speech: strictObject({
          provider: selection,
          model: selection,
          voice_id: selection,
          pitch: optional(numeric),
          rate: optional(numeric),
          ssml: optional(boolean()),
          language: optional(selection),
        }),
        displayModelId: optional(pipe(string(), maxLength(128), regex(/^[\w-]*$/))),
        artistry: optional(strictObject({
          enabled: optional(boolean()),
          provider: optional(selection),
          model: optional(selection),
          promptPrefix: optional(text),
          widgetInstruction: optional(text),
          spawnMode: optional(picklist(['bg', 'widget', 'inline', 'bg_widget'])),
          autonomousEnabled: optional(boolean()),
          autonomousThreshold: optional(numeric),
          autonomousTarget: optional(picklist(['user', 'assistant'])),
        })),
      }),
      agents: record(pipe(string(), maxLength(128)), strictObject({ prompt: text, enabled: optional(boolean()) })),
    }),
  }),
})

/** Private sync snapshot, separate from lossless local character-card backups. */
export type CharacterDocument = InferOutput<typeof CharacterDocumentSchema>

/** Revision zero creates an identity; later revisions compare against the retained contact revision. */
export const PutCharacterDocumentSchema = strictObject({
  expectedRevision: pipe(number(), integer(), minValue(0)),
  mutationId: pipe(string(), minLength(1), maxLength(128)),
  document: CharacterDocumentSchema,
})

export type PutCharacterDocument = InferOutput<typeof PutCharacterDocumentSchema>

const timestamp = pipe(string(), isoTimestamp())

/** Account-scoped sync identity; the deletion revision remains after the private document is removed. */
export const ContactSchema = strictObject({
  id: selection,
  ownerId: selection,
  characterId: selection,
  localCharacterId: nullable(selection),
  lastMutationId: nullable(selection),
  revision: pipe(number(), integer(), minValue(1)),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: nullable(timestamp),
})

export const ContactSnapshotSchema = strictObject({
  ...ContactSchema.entries,
  document: nullable(CharacterDocumentSchema),
})

export const ContactListSchema = strictObject({ contacts: array(ContactSnapshotSchema) })
export const ContactDeletionSchema = strictObject({ contact: ContactSchema, chatIds: array(selection) })

export type ContactSnapshot = InferOutput<typeof ContactSnapshotSchema>
export type ContactDeletion = InferOutput<typeof ContactDeletionSchema>
