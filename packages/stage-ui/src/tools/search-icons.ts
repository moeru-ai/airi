import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { description, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { searchTablerIcons } from '../libs/tabler-icons'

export const SEARCH_ICONS_TOOL_NAME = 'builtIn_searchIcons'

const searchIconsParameters = strictObject({
  query: pipe(string(), description('English words for what the icon draws, for example "cloud rain" or "device floppy".')),
})

/**
 * Finds Tabler icons for a model, so it picks a name that exists instead of guessing one.
 *
 * Use when:
 * - A model names an icon: in a card, or for a tool call.
 *
 * Returns:
 * - The tool. It answers with the best icons first, one icon on each line with its variants.
 */
export async function createSearchIconsTool(): Promise<Tool[]> {
  return [
    rawTool({
      name: SEARCH_ICONS_TOOL_NAME,
      description: 'Searches the Tabler icons by the English words of their names, best first. A name says what the icon draws, so search for a thing that it can draw.',
      parameters: await toJsonSchema(searchIconsParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(searchIconsParameters, rawInput)
        const query = parsed.success ? parsed.output.query.trim() : ''
        const hits = query ? await searchTablerIcons(query) : []
        // Icon names say what an icon draws, so an idea such as "weather" can find little, but "sun cloud" finds more.
        if (hits.length === 0)
          return `No Tabler icon matches "${query}". Search again with words for something that the icon can draw.`
        return [
          `Tabler icons for "${query}", best first:`,
          ...hits.map(hit => `${hit.name}${hit.variants.length > 0 ? ` (variants: ${hit.variants.join(', ')})` : ''}`),
        ].join('\n')
      },
    }),
  ]
}
