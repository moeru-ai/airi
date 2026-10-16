import type { ChatToolCallWidgetRegistry } from './tool-call-renderer'

import { array, looseObject, number, optional, parseJson, pipe, record, string, unknown } from 'valibot'

import ToolCallHomeAssistantWidget from './tool-call-home-assistant-widget.vue'
import ToolCallWebSearchWidget from './tool-call-web-search-widget.vue'

import { HOME_ASSISTANT_TOOL_NAMES } from '../../../../tools/home-assistant'
import { parseWebSearchResults, WEB_SEARCH_TOOL_NAME } from '../../../../tools/web-search'
import { readToolResult } from './tool-call-widget-reading'

const HomeAssistantEntitySchema = looseObject({ entityId: string(), state: string(), name: optional(string()) })

// The Home Assistant tools return JSON strings. A failed call returns an error text, which the schemas reject.
// A field that a schema does not name, such as `note`, shows under the widget as other data.
const HomeAssistantListSchema = pipe(string(), parseJson(), looseObject({ count: number(), total: number(), entities: array(HomeAssistantEntitySchema) }))
const HomeAssistantStateSchema = pipe(string(), parseJson(), looseObject({ ...HomeAssistantEntitySchema.entries, attributes: record(string(), unknown()) }))
const HomeAssistantChangedSchema = pipe(string(), parseJson(), looseObject({ changed: array(HomeAssistantEntitySchema) }))

/** Widgets for the tools that stage-ui owns. An app adds widgets for its own tools through `toolCallWidgets`. */
export const builtinToolCallWidgets: ChatToolCallWidgetRegistry = {
  [WEB_SEARCH_TOOL_NAME]: {
    component: ToolCallWebSearchWidget,
    read: (result) => {
      if (typeof result !== 'string')
        return undefined
      // A search without hits, or a failed one, returns a sentence instead of hits. The row shows that text as it is.
      const search = parseWebSearchResults(result)
      return search && search.links.length > 0 ? { props: search } : undefined
    },
  },
  // A list or a service call can report no devices. The row then shows the result as it is, not an empty card.
  [HOME_ASSISTANT_TOOL_NAMES.listEntities]: {
    component: ToolCallHomeAssistantWidget,
    read: result => readToolResult(HomeAssistantListSchema, result, ({ count, total, entities }) => entities.length > 0 ? { count, total, entities } : undefined),
  },
  [HOME_ASSISTANT_TOOL_NAMES.getState]: {
    component: ToolCallHomeAssistantWidget,
    read: result => readToolResult(HomeAssistantStateSchema, result, ({ attributes, ...entity }) => ({ entities: [entity], attributes })),
  },
  [HOME_ASSISTANT_TOOL_NAMES.callService]: {
    component: ToolCallHomeAssistantWidget,
    read: result => readToolResult(HomeAssistantChangedSchema, result, ({ changed }) => changed.length > 0 ? { entities: changed } : undefined),
  },
}
