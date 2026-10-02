import type { Tool } from '@xsai/shared-chat'

import type { MemoryEntry, MemoryVisibility } from '../stores/memory'

import { rawTool } from '@xsai/tool'
import { description, maxLength, minLength, picklist, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const READ_MEMORY_TOOL_NAME = 'builtIn_readMemory'
export const WRITE_MEMORY_TOOL_NAME = 'builtIn_writeMemory'
export const FORGET_MEMORY_TOOL_NAME = 'builtIn_forgetMemory'

const nameSchema = pipe(string(), minLength(1), maxLength(64), description('The entry name, as the memory index shows it, in kebab case.'))
const readParameters = strictObject({ name: nameSchema })
const forgetParameters = strictObject({ name: nameSchema })
// Strict function calling needs every property in `required`.
const writeParameters = strictObject({
  name: nameSchema,
  description: pipe(string(), maxLength(150), description('One line that tells when this fact matters.')),
  body: pipe(string(), minLength(1), maxLength(2000), description('The fact itself, with what makes it true or when it was said.')),
  visibility: pipe(picklist(['owner', 'shared']), description('owner: only conversations with the owner alone. shared: also scenes with other people.')),
})

/**
 * The memory part of a run's prompt: how to use memory, and the index that the reader can see.
 * The index changes only when an entry changes, so it stays in the cacheable prefix.
 */
export function composeMemoryPrompt(index: string, ownerOnly: boolean) {
  const lines = [
    '',
    '',
    'Long-term memory. Each index line names one remembered fact and when it matters.',
    `Read an entry with ${READ_MEMORY_TOOL_NAME} when it matters for your reply. The index alone is not the fact.`,
  ]
  if (ownerOnly) {
    lines.push(
      `Save a lasting fact about the owner with ${WRITE_MEMORY_TOOL_NAME}: one fact per entry. Update an existing entry instead of adding a near copy.`,
      'Mark an entry owner unless the owner wants it known in scenes with other people. Save no secret that the owner did not ask you to keep.',
      `Forget an entry with ${FORGET_MEMORY_TOOL_NAME} when it turns out wrong or the owner asks.`,
    )
  }
  lines.push(index ? `Memory index:\n${index}` : 'The memory index is empty.')
  return lines.join('\n')
}

/** What the memory tools change. The caller binds them to one reader. */
export interface CreateMemoryToolsOptions {
  /** The reader is the owner alone. Only then can the run see owner entries, write, or forget. */
  ownerOnly: boolean
  read: (name: string) => MemoryEntry | undefined
  write: (entry: { name: string, description: string, body: string, visibility: MemoryVisibility }) => MemoryEntry | undefined
  forget: (name: string) => boolean
}

/**
 * Creates the memory tools for one run. A scene run can only read shared entries.
 * The owner's own conversation can also write and forget, so a stranger cannot plant a memory.
 */
export async function createMemoryTools(options: CreateMemoryToolsOptions): Promise<Tool[]> {
  const tools: Tool[] = [
    rawTool({
      name: READ_MEMORY_TOOL_NAME,
      description: 'Read one long-term memory entry by its index name.',
      parameters: await toJsonSchema(readParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(readParameters, rawInput)
        const entry = parsed.success ? options.read(parsed.output.name) : undefined
        return entry ? `${entry.name} (${entry.visibility}): ${entry.body}` : 'No memory entry with that name.'
      },
    }),
  ]
  if (!options.ownerOnly)
    return tools

  tools.push(
    rawTool({
      name: WRITE_MEMORY_TOOL_NAME,
      description: 'Save or update one lasting fact in long-term memory.',
      parameters: await toJsonSchema(writeParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(writeParameters, rawInput)
        const entry = parsed.success ? options.write(parsed.output) : undefined
        return entry ? `Saved memory "${entry.name}".` : 'Memory not saved: it needs a name and a body.'
      },
    }),
    rawTool({
      name: FORGET_MEMORY_TOOL_NAME,
      description: 'Forget one long-term memory entry.',
      parameters: await toJsonSchema(forgetParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(forgetParameters, rawInput)
        return parsed.success && options.forget(parsed.output.name) ? `Forgot memory "${parsed.output.name}".` : 'No memory entry with that name.'
      },
    }),
  )
  return tools
}
