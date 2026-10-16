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
  props: Record<string, unknown>
  /** The fields of the result that the props do not cover. The row shows them under the widget, so no field is lost. */
  rest?: unknown
}

/**
 * A widget that shows the result of one tool inside the unfolded row of a tool call group.
 *
 * Use when:
 * - A tool returns data that reads better as a small view than as fields, for example a forecast or a list of links
 *
 * Expects:
 * - `read` gets the raw tool result and the serialized arguments of the call.
 * - `read` returns `undefined` when the widget cannot show the result, for example an error text.
 *
 * Returns:
 * - The component and its reader. The row shows the generic arguments and result when `read` returns `undefined`.
 */
export interface ChatToolCallWidget {
  component: Component
  read: (result: unknown, args: string) => ChatToolCallWidgetReading | undefined
}

/**
 * Maps tool names to the widgets of their results.
 */
export type ChatToolCallWidgetRegistry = Partial<Record<string, ChatToolCallWidget>>
