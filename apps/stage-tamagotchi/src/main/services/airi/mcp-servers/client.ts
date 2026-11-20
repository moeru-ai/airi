import type { AnySchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'

/** Aggregates a server catalog before the SDK installs its tool validation metadata. */
export class McpClient extends Client {
  override async request<S extends AnySchema>(
    request: Parameters<Client['request']>[0],
    schema: S,
    options?: RequestOptions,
  ): Promise<SchemaOutput<S>> {
    if (request.method !== 'tools/list' || !Object.is(schema, ListToolsResultSchema) || request.params?.cursor !== undefined)
      return super.request(request, schema, options)

    // Apply the existing discovery deadline to the whole walk.
    const deadline = AbortSignal.timeout(options?.maxTotalTimeout ?? options?.timeout ?? DEFAULT_REQUEST_TIMEOUT_MSEC)
    const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline
    const pageOptions = { ...options, signal }
    const first = await super.request(request, ListToolsResultSchema, pageOptions)
    if (first.nextCursor === undefined)
      return first as SchemaOutput<S>

    const tools = [...first.tools]
    let cursor: string | undefined = first.nextCursor
    while (cursor !== undefined) {
      signal.throwIfAborted()
      const page: ListToolsResult = await super.request({ ...request, params: { ...request.params, cursor } }, ListToolsResultSchema, pageOptions)
      tools.push(...page.tools)
      cursor = page.nextCursor
    }
    return { ...first, tools, nextCursor: undefined } as SchemaOutput<S>
  }
}
