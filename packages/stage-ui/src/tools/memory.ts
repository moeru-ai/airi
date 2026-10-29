import type { Tool } from '@xsai/shared-chat'

import type { MemoryEntry, MemoryWrite } from '../stores/memory'

import { rawTool } from '@xsai/tool'
import { array, description, maxLength, minLength, nullable, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const READ_MEMORY_TOOL_NAME = 'builtIn_readMemory'
export const WRITE_MEMORY_TOOL_NAME = 'builtIn_writeMemory'
export const FORGET_MEMORY_TOOL_NAME = 'builtIn_forgetMemory'

const idSchema = pipe(string(), minLength(1), description('The entry id, as the memory index shows it.'))
const readParameters = strictObject({
  ids: pipe(array(idSchema), minLength(1), description('Every entry that the reply needs, so one call reads them all.')),
})
/** Forgetting an entry takes only its id. */
const forgetParameters = strictObject({ id: idSchema })
// Strict function calling needs every property in `required`, in nested objects too, so a new entry gives a null id.
const entrySchema = strictObject({
  id: pipe(nullable(string()), description('The id of the entry to change, as the memory index shows it. Null for a new entry.')),
  description: pipe(string(), maxLength(150), description('One line for the index that names the topic. When the topic fits in one line, write its facts.')),
  body: pipe(string(), minLength(1), maxLength(2000), description('The facts of the topic, with what makes them true or when they were said.')),
})
const writeParameters = strictObject({
  entries: pipe(array(entrySchema), minLength(1), description('Every topic to save in this turn, one entry per topic.')),
})

/**
 * The memory part of a run's prompt: how to use memory, and the index of the run's persona.
 * The index changes only when an entry changes, so it stays in the cacheable prefix.
 */
export function composeMemoryPrompt(index: string) {
  return [
    '',
    '',
    'Long-term memory. You keep it yourself, so you remember the user across conversations.',
    'Each index line is one remembered fact: its id, then the fact or when it matters.',
    `When the user mentions something from before, check the index first. Read an entry with ${READ_MEMORY_TOOL_NAME} when your reply depends on it.`,
    'An index line that already states the fact needs no read.',
    `Save with ${WRITE_MEMORY_TOOL_NAME} when someone asks you to remember something, or corrects a remembered fact.`,
    'Other lasting facts about the user are saved for you after each turn.',
    'One entry for each topic. To add to or change a remembered topic, write its entry with its id instead of adding a near copy. Never save what a recipe already holds, your own rules, codes, passwords, or secrets.',
    `Forget an entry by its id with ${FORGET_MEMORY_TOOL_NAME} when it turns out wrong or someone asks. General entries belong to the owner, so you cannot change or forget them.`,
    index ? `Memory index:\n${index}` : 'The memory index is empty.',
  ].join('\n')
}

/** What the memory tools change. The caller binds them to the run's character card. */
interface CreateMemoryToolsOptions {
  read: (id: string) => MemoryEntry | undefined
  write: (entry: MemoryWrite) => MemoryEntry | undefined
  forget: (id: string) => boolean
}

/** Creates the memory tools for one run. The run reads its card's memories and the general ones, and changes only its card's. */
export async function createMemoryTools(options: CreateMemoryToolsOptions): Promise<Tool[]> {
  return [
    rawTool({
      name: READ_MEMORY_TOOL_NAME,
      description: 'Read long-term memory entries by their index ids.',
      parameters: await toJsonSchema(readParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(readParameters, rawInput)
        if (!parsed.success)
          return 'Give at least one entry id from the memory index.'
        return parsed.output.ids.map((id) => {
          const entry = options.read(id)
          return entry ? `${entry.id} (${entry.persona ? 'yours' : 'general'}): ${entry.body}` : `No memory entry with id "${id}".`
        }).join('\n')
      },
    }),
    rawTool({
      name: WRITE_MEMORY_TOOL_NAME,
      description: 'Save or update lasting facts in long-term memory, one entry per topic.',
      parameters: await toJsonSchema(writeParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(writeParameters, rawInput)
        if (!parsed.success)
          return 'Memory not saved: each entry needs an id or null, and a body.'
        return parsed.output.entries.map((input) => {
          const entry = options.write({ id: input.id ?? undefined, description: input.description, body: input.body })
          return entry ? `Saved memory "${entry.id}".` : 'Memory not saved: it needs a body.'
        }).join('\n')
      },
    }),
    rawTool({
      name: FORGET_MEMORY_TOOL_NAME,
      description: 'Forget one long-term memory entry.',
      parameters: await toJsonSchema(forgetParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(forgetParameters, rawInput)
        return parsed.success && options.forget(parsed.output.id) ? `Forgot memory "${parsed.output.id}".` : 'No memory entry with that id.'
      },
    }),
  ]
}
