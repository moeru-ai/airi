import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { description, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { searchTablerIcons } from '../libs/tabler-icons'

export const SEARCH_ICONS_TOOL_NAME = 'builtIn_searchIcons'

const searchIconsParameters = strictObject({
  query: pipe(string(), description('English words for what the icon draws or stands for, for example "cloud rain" or "save".')),
})

/**
 * Finds Tabler icons for a model, so it picks a name that exists instead of guessing one.
 *
 * Use when:
 * - A model names an icon: in a card, or for a tool call.
 *
 * Returns:
 * - The tool. It answers with the best icons first, one icon on each line with its tags and variants.
 */
export async function createSearchIconsTool(): Promise<Tool[]> {
  return [
    rawTool({
      name: SEARCH_ICONS_TOOL_NAME,
      description: 'Searches the Tabler icons by the English words of their names and tags, best first. The tags of a hit say what the icon can stand for.',
      parameters: await toJsonSchema(searchIconsParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(searchIconsParameters, rawInput)
        const query = parsed.success ? parsed.output.query.trim() : ''
        const hits = query ? await searchTablerIcons(query) : []
        if (hits.length === 0)
          return `No Tabler icon matches "${query}". Search again with other English words.`
        return [
          `Tabler icons for "${query}", best first, each with its tags:`,
          ...hits.map(hit => `${hit.name}: ${hit.tags.join(', ')}${hit.variants.length > 0 ? `. Variants: ${hit.variants.join(', ')}` : ''}`),
        ].join('\n')
      },
    }),
  ]
}
