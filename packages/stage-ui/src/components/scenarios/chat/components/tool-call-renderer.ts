import type { Component } from 'vue'

/**
 * Props passed to a tool-call renderer component.
 *
 * Use when:
 * - A runtime registers a custom renderer for a tool name
 * - A generic chat surface needs to forward tool-call render data without owning runtime state
 *
 * Expects:
 * - `args` is the raw serialized tool-call argument payload
 * - `result` is the latest matching tool-call result when available
 *
 * Returns:
 * - A prop contract that custom runtime renderers can implement
 */
export interface ChatToolCallRendererProps {
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: unknown
}

/**
 * Maps tool names to custom renderer components.
 */
export type ChatToolCallRendererRegistry = Partial<Record<string, Component>>

/** What a widget reads from one tool result. */
export interface ChatToolCallWidgetReading {
  /** The props of the widget component. `defineToolCallWidget` checks them against the component. */
  props: object
  /** The fields of the result that the props do not cover. The row shows them under the widget, so no field is lost. */
  rest?: unknown
  /** The tool returned, but its result says that the call did not do what it asked. The row and the pill count the call as failed. */
  failed?: boolean
}

/** A translation key with its named values. A widget names its call with it, and the chat translates it. */
export interface ChatToolCallTitle {
  key: string
  params?: Record<string, string>
}

/**
 * A widget that shows the result of one tool inside the unfolded row of a tool call group.
 *
 * Use when:
 * - A tool returns data that reads better as a small view than as fields, for example a forecast or a list of links
 *
 * Expects:
 * - `read` gets the raw tool result and the serialized arguments as the model wrote them. They also hold the call
 *   summary, so a reader reads only the fields that it needs.
 * - `read` returns `undefined` when the widget cannot show the result, for example an error text.
 * - `title` gets the same values, and `undefined` as the result while the call runs.
 *
 * Returns:
 * - The component and its reader. The row shows the generic arguments and result when `read` returns `undefined`.
 * - An optional title. The row and a pill of one call show it in place of the tool name, so it also says the state of the call.
 */
export interface ChatToolCallWidget {
  component: Component
  read: (result: unknown, args: string) => ChatToolCallWidgetReading | undefined
  title?: (result: unknown, args: string) => ChatToolCallTitle | undefined
}

/** The props that a component takes, read from its instance type. */
type PropsOf<TComponent> = TComponent extends abstract new (...args: never[]) => { $props: infer TProps extends object } ? TProps : never

/**
 * Registers a widget, and checks that its reader returns the props of its component.
 *
 * The registry holds widgets of many components, so it keeps only `ChatToolCallWidget`. This helper checks each widget
 * before it enters the registry.
 *
 * @example
 * const weatherWidget = defineToolCallWidget(WeatherCard, result => ({ props: { report: readReport(result) } }))
 */
export function defineToolCallWidget<TComponent extends Component>(
  component: TComponent,
  read: (result: unknown, args: string) => { props: PropsOf<TComponent>, rest?: unknown, failed?: boolean } | undefined,
  options?: Pick<ChatToolCallWidget, 'title'>,
): ChatToolCallWidget {
  return { component, read, ...options }
}

/**
 * Maps tool names to the widgets of their results.
 */
export type ChatToolCallWidgetRegistry = Partial<Record<string, ChatToolCallWidget>>
