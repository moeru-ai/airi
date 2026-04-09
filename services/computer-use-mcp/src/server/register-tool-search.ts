/**
 * Tool Search Registration
 *
 * Registers the public `tool_search` tool that provides lightweight
 * descriptor-based candidate retrieval for large toolsets.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ToolDescriptor, ToolKind, ToolLane } from './tool-descriptors'

import { z } from 'zod'

import { textContent } from './content'
import {
  globalRegistry,
  initializeGlobalRegistry,
  registerToolWithDescriptor,
  requireDescriptor,
  toolInstances,
} from './tool-descriptors'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20

type MatchBasis = 'canonical_exact' | 'display' | 'summary' | 'canonical_partial'

interface RankedCandidate {
  descriptor: ToolDescriptor
  matchBasis: MatchBasis
  sourceOrder: number
}

/**
 * Options for registering tool_search.
 */
export interface RegisterToolSearchOptions {
  server: McpServer
}

function getMatchBasis(descriptor: ToolDescriptor, queryLower: string): MatchBasis | undefined {
  const canonicalLower = descriptor.canonicalName.toLowerCase()
  const displayLower = descriptor.displayName.toLowerCase()
  const summaryLower = descriptor.summary.toLowerCase()

  if (canonicalLower === queryLower)
    return 'canonical_exact'

  if (displayLower.includes(queryLower))
    return 'display'

  if (summaryLower.includes(queryLower))
    return 'summary'

  if (canonicalLower.includes(queryLower))
    return 'canonical_partial'

  return undefined
}

function getMatchRank(matchBasis: MatchBasis): number {
  switch (matchBasis) {
    case 'canonical_exact':
      return 0
    case 'display':
      return 1
    case 'summary':
      return 2
    case 'canonical_partial':
      return 3
  }
}

/**
 * Register the tool_search tool.
 */
export function registerToolSearch({ server }: RegisterToolSearchOptions): void {
  if (globalRegistry.size === 0) {
    initializeGlobalRegistry()
  }

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('tool_search'),
    schema: {
      query: z.string().min(1).describe('Search query used for lightweight descriptor matching.'),
      lane: z.string().optional().describe('Optional lane filter applied before ranking candidates.'),
      kind: z.string().optional().describe('Optional kind filter applied before ranking candidates.'),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Maximum number of candidates to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT}).`),
      exposeTools: z.array(z.string()).optional().describe('Optional list of canonicalNames to immediately expose in your tool list for subsequent turns.'),
    },
    handler: async ({ query, lane, kind, limit, exposeTools }) => {
      const queryLower = query.trim().toLowerCase()
      const targetLimit = limit ?? DEFAULT_LIMIT

      if (exposeTools && exposeTools.length > 0) {
        for (const toolName of exposeTools) {
          const registeredTool = toolInstances.get(toolName)
          if (registeredTool) {
            registeredTool.enable()
          }
        }
      }

      const scoped = globalRegistry.query({
        lane: lane as ToolLane | undefined,
        kind: kind as ToolKind | undefined,
      })

      const ranked = scoped
        .map<RankedCandidate | undefined>((descriptor, sourceOrder) => {
          const matchBasis = getMatchBasis(descriptor, queryLower)
          if (!matchBasis)
            return undefined

          return {
            descriptor,
            matchBasis,
            sourceOrder,
          }
        })
        .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
        .sort((a, b) => {
          const rankDiff = getMatchRank(a.matchBasis) - getMatchRank(b.matchBasis)
          if (rankDiff !== 0)
            return rankDiff

          return a.sourceOrder - b.sourceOrder
        })

      const candidates = ranked.slice(0, targetLimit)
      const compactLines = candidates.map(candidate => (
        `${candidate.descriptor.canonicalName} | ${candidate.descriptor.summary} | ${candidate.descriptor.lane}`
      ))

      const compactText = compactLines.length > 0
        ? `Top ${compactLines.length} candidate(s):\n\n${compactLines.join('\n')}`
        : 'No tools match the specified query and filters.'

      const exposedText = exposeTools && exposeTools.length > 0
        ? `\n\nSuccessfully exposed the following tools to your active list: ${exposeTools.join(', ')}.`
        : ''

      return {
        content: [textContent(compactText + exposedText)],
        structuredContent: {
          status: 'ok' as const,
          query,
          totalCandidates: ranked.length,
          returnedCount: candidates.length,
          filters: {
            lane: lane ?? null,
            kind: kind ?? null,
            limit: targetLimit,
            exposeTools: exposeTools ?? null,
          },
          candidates: candidates.map(candidate => ({
            canonicalName: candidate.descriptor.canonicalName,
            displayName: candidate.descriptor.displayName,
            summary: candidate.descriptor.summary,
            lane: candidate.descriptor.lane,
            kind: candidate.descriptor.kind,
            matchBasis: candidate.matchBasis,
          })),
        },
      }
    },
  })
}
