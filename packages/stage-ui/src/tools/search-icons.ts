import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { description, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { searchMingcuteIcons } from '../libs/mingcute-icons'

export const SEARCH_ICONS_TOOL_NAME = 'builtIn_searchIcons'

const searchIconsParameters = strictObject({
  query: pipe(string(), description('English words for what the icon draws, for example "cloud rain" or "coin exchange".')),
})

/**
 * Finds MingCute icons for a model, so it picks a name that exists instead of guessing one.
 *
 * Use when:
 * - A model names an icon: in a card, or for a tool call.
 *
 * Returns:
 * - The tool. It answers with the best icons first, one drawing on each line with its styles.
 */
export async function createSearchIconsTool(): Promise<Tool[]> {
  return [
    rawTool({
      name: SEARCH_ICONS_TOOL_NAME,
      description: 'Searches the MingCute icons by the English words of their names, best first. Search for what the icon draws.',
      parameters: await toJsonSchema(searchIconsParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(searchIconsParameters, rawInput)
        const query = parsed.success ? parsed.output.query.trim() : ''
        const hits = query ? await searchMingcuteIcons(query) : []
        // Icon names say what an icon draws, so an idea such as "weather" finds nothing, but "sun cloud" does.
        if (hits.length === 0)
          return `No MingCute icon matches "${query}". Search again with words for something that the icon can draw.`
        return [`MingCute icons for "${query}", best first:`, ...hits.map(styles => styles.join(' / '))].join('\n')
      },
    }),
  ]
}
