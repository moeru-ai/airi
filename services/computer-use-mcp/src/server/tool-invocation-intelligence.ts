/**
 * Tool Invocation Intelligence
 *
 * AIRI-native tool call interception layer. Extends lane hygiene with three
 * additional capabilities consumed through the global McpServer proxy:
 *
 * 1. Safety Tier Advisory — graduated advisory based on descriptor metadata
 *    (destructive, readOnly, concurrencySafe). Advisory-only, never blocks.
 *
 * 2. Result Budget Guard — truncates oversized tool results to prevent
 *    context window bloat, appending a structured truncation notice.
 *
 * 3. Invocation Telemetry — lightweight per-tool call tracking for
 *    diagnostic and memory purposes.
 *
 * Design philosophy (diverges from Claude Code's approach):
 * - Claude Code embeds safety/budget logic INTO each tool definition.
 *   AIRI does it in the interceptor layer — tools stay pure; intelligence
 *   is orthogonal. Tools don't need to know about budgets or safety tiers.
 * - Advisory-only: all signals are informational. We never block execution.
 * - The interceptor reads from the existing ToolDescriptor registry.
 *   No new per-tool configuration is needed.
 */

import type { ToolDescriptor, ToolLane } from './tool-descriptors'

import { globalRegistry } from './tool-descriptors'

// ---------------------------------------------------------------------------
// 1. Safety Tier Advisory
// ---------------------------------------------------------------------------

/**
 * Safety tier derived from descriptor metadata.
 *
 *   safe       — readOnly=true, destructive=false
 *   guarded    — readOnly=false, destructive=false (default write)
 *   destructive — destructive=true
 */
export type ToolSafetyTier = 'safe' | 'guarded' | 'destructive'

export function inferSafetyTier(descriptor: ToolDescriptor): ToolSafetyTier {
  if (descriptor.destructive) {
    return 'destructive'
  }

  if (descriptor.readOnly) {
    return 'safe'
  }

  return 'guarded'
}

/**
 * Build a safety-tier advisory for destructive tools.
 * Only fires for `destructive` tier — `safe` and `guarded` are silent.
 *
 * Returns null when no advisory is needed.
 */
export function buildSafetyTierAdvisory(toolName: string): string | null {
  const descriptor = globalRegistry.getOptional(toolName)
  if (!descriptor) {
    return null
  }

  const tier = inferSafetyTier(descriptor)
  if (tier !== 'destructive') {
    return null
  }

  return (
    `⚠️ Destructive operation: "${toolName}" can cause irreversible changes. `
    + `Verify your intent before proceeding. Consider reading the target state first.`
  )
}

// ---------------------------------------------------------------------------
// 2. Result Budget Guard
// ---------------------------------------------------------------------------

/**
 * Default result budget per tool call, in characters.
 * Tools can override via descriptor (future), but the global default
 * prevents any single tool from consuming unbounded context.
 *
 * 50_000 chars ≈ ~12,500 tokens — generous for most tool results.
 * Screenshot base64 and large file reads are the main consumers.
 */
const DEFAULT_RESULT_BUDGET_CHARS = 50_000

/**
 * Tools whose results should never be truncated.
 * Screenshots and display captures may legitimately exceed the budget.
 */
const BUDGET_EXEMPT_TOOLS = new Set([
  'screenshot',
  'display_screenshot',
  'display_identify',
  // coding tools that return structured content (small by design)
  'coding_compress_context',
  'coding_report_status',
  'workflow_coding_loop',
])

interface ResultBudgetOutcome {
  /** Whether the result was truncated. */
  truncated: boolean
  /** The (potentially truncated) content items. */
  content: Array<{ type: string, text?: string, [key: string]: unknown }>
  /** Original size in characters if truncated, undefined otherwise. */
  originalSize?: number
}

/**
 * Apply the result budget to a tool's output content.
 * Truncates text content items that exceed the budget and appends a notice.
 *
 * Non-text content (images, etc.) is passed through untouched.
 */
export function applyResultBudget(
  toolName: string,
  content: Array<{ type: string, text?: string, [key: string]: unknown }>,
  budget: number = DEFAULT_RESULT_BUDGET_CHARS,
): ResultBudgetOutcome {
  if (BUDGET_EXEMPT_TOOLS.has(toolName)) {
    return { truncated: false, content }
  }

  let totalTextChars = 0
  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string') {
      totalTextChars += item.text.length
    }
  }

  if (totalTextChars <= budget) {
    return { truncated: false, content }
  }

  // Truncate: keep text items until budget is exhausted
  let remaining = budget
  const truncatedContent: typeof content = []

  for (const item of content) {
    if (item.type !== 'text' || typeof item.text !== 'string') {
      // Non-text items pass through
      truncatedContent.push(item)
      continue
    }

    if (remaining <= 0) {
      // Budget exhausted — skip remaining text
      continue
    }

    if (item.text.length <= remaining) {
      truncatedContent.push(item)
      remaining -= item.text.length
    }
    else {
      // Partial truncation — cut at word boundary if possible
      const cutPoint = item.text.lastIndexOf(' ', remaining)
      const safeCut = cutPoint > remaining * 0.8 ? cutPoint : remaining
      truncatedContent.push({ ...item, text: item.text.slice(0, safeCut) })
      remaining = 0
    }
  }

  // Append truncation notice
  truncatedContent.push({
    type: 'text',
    text: `\n\n📏 [Result truncated: ${totalTextChars.toLocaleString()} chars → ${budget.toLocaleString()} char budget. `
      + `Use targeted reads or filters to access the remaining content.]`,
  })

  return {
    truncated: true,
    content: truncatedContent,
    originalSize: totalTextChars,
  }
}

// ---------------------------------------------------------------------------
// 3. Invocation Telemetry
// ---------------------------------------------------------------------------

export interface ToolInvocationRecord {
  toolName: string
  lane: ToolLane | undefined
  safetyTier: ToolSafetyTier
  /** ISO timestamp */
  calledAt: string
  /** Duration in ms, set after completion */
  durationMs?: number
  /** Whether the result was truncated by budget guard */
  resultTruncated: boolean
}

/**
 * In-session invocation log. Bounded to last N entries to prevent
 * unbounded growth. Used for diagnostic and memory purposes.
 */
const MAX_INVOCATION_LOG = 100

const invocationLog: ToolInvocationRecord[] = []

export function recordInvocation(record: ToolInvocationRecord): void {
  invocationLog.push(record)
  if (invocationLog.length > MAX_INVOCATION_LOG) {
    invocationLog.shift()
  }
}

export function getInvocationLog(): readonly ToolInvocationRecord[] {
  return invocationLog
}

export function getInvocationSummary(): {
  totalCalls: number
  byLane: Record<string, number>
  destructiveCalls: number
  truncatedResults: number
} {
  const byLane: Record<string, number> = {}
  let destructiveCalls = 0
  let truncatedResults = 0

  for (const entry of invocationLog) {
    const lane = entry.lane ?? 'unknown'
    byLane[lane] = (byLane[lane] ?? 0) + 1
    if (entry.safetyTier === 'destructive') {
      destructiveCalls++
    }
    if (entry.resultTruncated) {
      truncatedResults++
    }
  }

  return {
    totalCalls: invocationLog.length,
    byLane,
    destructiveCalls,
    truncatedResults,
  }
}

/** Clear the invocation log (for testing). */
export function clearInvocationLog(): void {
  invocationLog.length = 0
}
