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
