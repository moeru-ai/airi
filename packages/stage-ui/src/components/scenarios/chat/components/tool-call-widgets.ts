import type { ChatToolCallWidgetRegistry } from './tool-call-renderer'

import ToolCallWebSearchWidget from './tool-call-web-search-widget.vue'

import { parseWebSearchResults, WEB_SEARCH_TOOL_NAME } from '../../../../tools/web-search'

/** Widgets for the tools that stage-ui owns. An app adds widgets for its own tools through `toolCallWidgets`. */
export const builtinToolCallWidgets: ChatToolCallWidgetRegistry = {
  [WEB_SEARCH_TOOL_NAME]: {
    component: ToolCallWebSearchWidget,
    propsOf: (result) => {
      if (typeof result !== 'string')
        return undefined
      // A search without hits, or a failed one, returns a sentence instead of hits. The row shows that text as it is.
      const links = parseWebSearchResults(result)
      return links.length > 0 ? { links } : undefined
    },
  },
}
