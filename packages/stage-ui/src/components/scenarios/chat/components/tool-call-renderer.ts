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

/**
 * A widget that shows the result of one tool inside the unfolded row of a tool call group.
 *
 * Use when:
 * - A tool returns data that reads better as a small view than as fields, for example a forecast or a list of links
 *
 * Expects:
 * - `propsOf` reads the raw tool result. It returns `undefined` when the widget cannot show the result, for example an error text.
 *
 * Returns:
 * - The component and a reader for its props. The row shows the generic arguments and result when `propsOf` returns `undefined`.
 */
export interface ChatToolCallWidget {
  component: Component
  propsOf: (result: unknown) => Record<string, unknown> | undefined
}

/**
 * Maps tool names to the widgets of their results.
 */
export type ChatToolCallWidgetRegistry = Partial<Record<string, ChatToolCallWidget>>
