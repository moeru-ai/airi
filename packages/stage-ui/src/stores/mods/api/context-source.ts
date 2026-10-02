import type { ContextReader } from '@proj-airi/core-agent'
import type { ContextSourceRef } from '@proj-airi/core-agent/context'
import type { WebSocketEvents } from '@proj-airi/server-sdk'

import { errorMessageFrom } from '@moeru/std'
import { CONTEXT_SOURCE_TOKEN_LIMIT, limitContextText, loadContextTokenCounter } from '@proj-airi/core-agent'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'

import { useChatContextStore } from '../../chat/context-store'
import { useModsServerChannelStore } from './channel-server'

/** Reads renderer-owned details for one origin handle. Return `undefined` when the details are gone. */
export type ContextSourceReader = (sourceRef: ContextSourceRef) => string | undefined | Promise<string | undefined>

const CONTEXT_SOURCE_TIMEOUT_MS = 5000

/**
 * Resolves origin handles from the shared observation pool.
 *
 * Use when:
 * - A model request needs the details behind a `Source details:` observation.
 * - A renderer produced observations and must answer reads for its own handles.
 *
 * Expects:
 * - Each renderer calls {@link listen} once while its server channel runs.
 *
 * Returns:
 * - Details only for handles that the reader can already see, from the writer that the server identified.
 */
export const useContextSourceStore = defineStore('mods:api:context-source', () => {
  const serverChannel = useModsServerChannelStore()
  const chatContext = useChatContextStore()
  const readers = new Map<string, ContextSourceReader>()
  const pending = new Map<string, { writer: string, settle: (response: WebSocketEvents['context:source:response']) => void }>()

  /** Registers this renderer's reader for one reference type. */
  function registerSource(refType: string, read: ContextSourceReader) {
    readers.set(refType, read)
    return () => {
      if (readers.get(refType) === read)
        readers.delete(refType)
    }
  }

  async function readLocal(sourceRef: ContextSourceRef) {
    const text = await readers.get(sourceRef.refType)?.(sourceRef)
    if (text === undefined)
      throw new Error('Source unavailable')
    return text
  }

  function readRemote(writer: string, sourceRef: ContextSourceRef) {
    const requestId = nanoid()
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('Source request timed out'))
      }, CONTEXT_SOURCE_TIMEOUT_MS)
      pending.set(requestId, {
        writer,
        settle: (response) => {
          clearTimeout(timeout)
          pending.delete(requestId)
          if (response.text === undefined)
            reject(new Error(response.error ?? 'Source unavailable'))
          else
            resolve(response.text)
        },
      })
      serverChannel.send({
        type: 'context:source:request',
        route: { destinations: [{ type: 'connection', connections: [writer] }] },
        data: { requestId, sourceRef },
      })
    })
  }

  /** Reads the details behind one handle. The reader must see an observation that carries it. */
  async function readSource(reader: ContextReader, sourceRef: ContextSourceRef) {
    const entry = Object.values(chatContext.getContextsSnapshot(reader)).flat().find(message => message.sourceRef?.refType === sourceRef.refType && message.sourceRef.targetId === sourceRef.targetId)
    if (!entry)
      throw new Error('No visible observation references this source')
    const writer = entry.metadata?.originConnectionId
    if (!writer)
      throw new Error('The source writer is unknown')

    const text = writer === serverChannel.connectionId
      ? await readLocal(sourceRef)
      : await readRemote(writer, sourceRef)
    return limitContextText(text, await loadContextTokenCounter(), CONTEXT_SOURCE_TOKEN_LIMIT)
  }

  /** Answers reads for this renderer's handles, and settles answers to its own reads. */
  function listen() {
    const stops = [
      serverChannel.onEvent('context:source:request', async (event) => {
        const requester = event.metadata?.originConnectionId
        if (!requester)
          return

        let text: string | undefined
        let error: string | undefined
        try {
          text = await readLocal(event.data.sourceRef)
        }
        catch (cause) {
          error = errorMessageFrom(cause) ?? 'Source unavailable'
        }
        serverChannel.send({
          type: 'context:source:response',
          route: { destinations: [{ type: 'connection', connections: [requester] }] },
          data: { requestId: event.data.requestId, sourceRef: event.data.sourceRef, ...(text === undefined ? { error } : { text }) },
        })
      }),
      serverChannel.onEvent('context:source:response', (event) => {
        const waiter = pending.get(event.data.requestId)
        // The server stamps the sender. Only the writer that was asked can answer.
        if (waiter && event.metadata?.originConnectionId === waiter.writer)
          waiter.settle(event.data)
      }),
    ]
    return () => {
      for (const stop of stops)
        stop()
    }
  }

  return {
    registerSource,
    readSource,
    listen,
  }
})
