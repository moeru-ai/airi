import type { ChatToolCallWidgetRegistry } from './tool-call-renderer'
import type { ToolResultCoverage } from './tool-call-widget-reading'

import { array, looseObject, number, optional, parseJson, pipe, record, safeParse, string, unknown } from 'valibot'

import ToolCallHomeAssistantWidget from './tool-call-home-assistant-widget.vue'
import ToolCallJudgmentWidget from './tool-call-judgment-widget.vue'
import ToolCallRecipeWidget from './tool-call-recipe-widget.vue'
import ToolCallWebSearchWidget from './tool-call-web-search-widget.vue'

import { HOME_ASSISTANT_TOOL_NAMES } from '../../../../tools/home-assistant'
import { JUDGE_RECIPE_TOOL_NAME, parseJson as parseRecordedJson, readJudgment } from '../../../../tools/judge-recipe'
import { readRecipeUse, USE_RECIPE_TOOL_NAME } from '../../../../tools/use-recipe'
import { parseWebSearchResults, WEB_SEARCH_TOOL_NAME } from '../../../../tools/web-search'
import { defineToolCallWidget } from './tool-call-renderer'
import { restOf } from './tool-call-widget-reading'

// The Home Assistant tools return JSON strings. A failed call returns an error text, which the schemas reject.
// The schemas keep unknown fields, so they can show under the widget as other data.
const HomeAssistantEntitySchema = looseObject({ entityId: string(), state: string(), name: optional(string()) })
const HomeAssistantListSchema = pipe(string(), parseJson(), looseObject({ count: number(), total: number(), entities: array(HomeAssistantEntitySchema) }))
const HomeAssistantStateSchema = pipe(string(), parseJson(), looseObject({ ...HomeAssistantEntitySchema.entries, attributes: record(string(), unknown()) }))
const HomeAssistantChangedSchema = pipe(string(), parseJson(), looseObject({ changed: array(HomeAssistantEntitySchema) }))

/** The fields of one device that a device row shows. */
const ENTITY_SHOWN: ToolResultCoverage = { entityId: true, state: true, name: true }

/** The title shows the state and the name of a recipe call. The widget shows the fields of each outcome. */
const RECIPE_SHOWN: ToolResultCoverage = { status: true, name: true, instructions: true, task: true, usable: true, reason: true }
/** The title shows the state and the name of a judgment. The widget shows the answer, what follows, or why the call went wrong. */
const JUDGMENT_SHOWN: ToolResultCoverage = { status: true, name: true, answer: true, follow: true, reason: true }
/** `next` tells the character the same step that `follow` shows. */
const JUDGMENT_OMITTED: ToolResultCoverage = { next: true }

/** Widgets for the tools that stage-ui owns. An app adds widgets for its own tools through `toolCallWidgets`. */
export const builtinToolCallWidgets: ChatToolCallWidgetRegistry = {
  [WEB_SEARCH_TOOL_NAME]: defineToolCallWidget(ToolCallWebSearchWidget, (result) => {
    if (typeof result !== 'string')
      return undefined
    // A search without hits, or a failed one, returns a sentence instead of hits. The row shows that text as it is.
    // The card shows every part of a result with hits: the query, and the link, title, snippet, and icon of each hit.
    const search = parseWebSearchResults(result)
    return search && search.links.length > 0 ? { props: search } : undefined
  }),
  // A list or a service call can report no devices. The row then shows the result as it is, not an empty card.
  // A `note` is written for the model, so it shows as other data.
  [HOME_ASSISTANT_TOOL_NAMES.listEntities]: defineToolCallWidget(ToolCallHomeAssistantWidget, (result) => {
    const list = safeParse(HomeAssistantListSchema, result)
    if (!list.success || list.output.entities.length === 0)
      return undefined
    const { count, total, entities } = list.output
    return { props: { count, total, entities }, rest: restOf(list.output, { count: true, total: true, entities: [ENTITY_SHOWN] }) }
  }),
  [HOME_ASSISTANT_TOOL_NAMES.getState]: defineToolCallWidget(ToolCallHomeAssistantWidget, (result) => {
    const state = safeParse(HomeAssistantStateSchema, result)
    if (!state.success)
      return undefined
    const { attributes, ...entity } = state.output
    return { props: { entities: [entity], attributes }, rest: restOf(state.output, { ...ENTITY_SHOWN, attributes: true }) }
  }),
  [HOME_ASSISTANT_TOOL_NAMES.callService]: defineToolCallWidget(ToolCallHomeAssistantWidget, (result) => {
    const call = safeParse(HomeAssistantChangedSchema, result)
    if (!call.success || call.output.changed.length === 0)
      return undefined
    return { props: { entities: call.output.changed }, rest: restOf(call.output, { changed: [ENTITY_SHOWN] }) }
  }),
  // A recipe call that the model makes lands in the combo like any tool. A recipe that did not start counts as a miss.
  [USE_RECIPE_TOOL_NAME]: defineToolCallWidget(ToolCallRecipeWidget, (result, args) => {
    const { outcome } = readRecipeUse(args, result)
    if (!outcome)
      return undefined
    return { props: { outcome }, rest: restOf(parseRecordedJson(result), RECIPE_SHOWN), failed: outcome.status !== 'loaded' && outcome.status !== 'started' }
  }, {
    // A call without a result still runs. A result that is no outcome is the error text of a call that did not start.
    title: (result, args) => {
      const use = readRecipeUse(args, result)
      return { key: `stage.chat.recipe.${use.outcome?.status ?? (result === undefined ? 'using' : 'failed')}`, params: { name: use.name } }
    },
  }),
  [JUDGE_RECIPE_TOOL_NAME]: defineToolCallWidget(ToolCallJudgmentWidget, (result, args) => {
    const { outcome } = readJudgment(args, result)
    if (!outcome)
      return undefined
    return { props: { outcome }, rest: restOf(parseRecordedJson(result), JUDGMENT_SHOWN, JUDGMENT_OMITTED), failed: outcome.status === 'invalid' }
  }, {
    // A result that is no outcome is an error text. The row marks it as failed, so the title only names the judgment.
    title: (result, args) => {
      const judgment = readJudgment(args, result)
      return { key: `stage.chat.judgment.${judgment.outcome?.status ?? (result === undefined ? 'running' : 'judged')}`, params: { name: judgment.name } }
    },
  }),
}
