import type { HomeAssistantClient } from '../libs/home-assistant/client'

import { describe, expect, it, vi } from 'vitest'

import { createHomeAssistantTools } from './home-assistant'

function createClient(overrides: Partial<HomeAssistantClient> = {}): HomeAssistantClient {
  return {
    callService: vi.fn(async () => []),
    getState: vi.fn(async () => ({ entityId: 'light.kitchen', state: 'off', attributes: {} })),
    listEntities: vi.fn(async () => []),
    ...overrides,
  }
}

async function tools(client: HomeAssistantClient, options?: { entityLimit?: number }) {
  const created = await createHomeAssistantTools(client, options)
  return new Map(created.map(entry => [entry.function.name, entry]))
}

function execute(entry: { execute?: unknown } | undefined, input: unknown) {
  if (!entry?.execute)
    throw new Error('Expected the tool to define an execute function.')

  return (entry.execute as (value: unknown, options: unknown) => Promise<unknown>)(input, { messages: [], toolCallId: 'call-1' })
}

describe('home assistant tools', () => {
  it('mounts one tool per Home Assistant operation', async () => {
    const mounted = await tools(createClient())

    expect([...mounted.keys()].sort()).toEqual([
      'home_assistant_call_service',
      'home_assistant_get_state',
      'home_assistant_list_entities',
    ])
  })

  it('keeps attributes out of the entity list and reports a readable name', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => [
        { entityId: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen', brightness: 120 } },
        { entityId: 'switch.pump', state: 'off', attributes: {} },
      ]),
    })
    const mounted = await tools(client)

    expect(JSON.parse(await execute(mounted.get('home_assistant_list_entities'), {}) as string)).toEqual({
      count: 2,
      total: 2,
      entities: [
        { entityId: 'light.kitchen', state: 'on', name: 'Kitchen' },
        { entityId: 'switch.pump', state: 'off' },
      ],
    })
  })

  it('filters the list by domain', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => [
        { entityId: 'light.kitchen', state: 'on', attributes: {} },
        { entityId: 'climate.hall', state: 'heat', attributes: {} },
      ]),
    })
    const mounted = await tools(client)

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), { domain: 'light' }) as string)

    expect(result.entities).toEqual([{ entityId: 'light.kitchen', state: 'on' }])
    expect(result.total).toBe(1)
  })

  it('caps the list and says so', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => Array.from({ length: 5 }, (_, index) => ({
        entityId: `light.${index}`,
        state: 'on',
        attributes: {},
      }))),
    })
    const mounted = await tools(client, { entityLimit: 2 })

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), {}) as string)

    expect(result.count).toBe(2)
    expect(result.total).toBe(5)
    expect(result.note).toContain('2 of 5')
  })

  it('reads one state with its attributes', async () => {
    const client = createClient({
      getState: vi.fn(async () => ({
        entityId: 'climate.hall',
        state: 'heat',
        attributes: { friendly_name: 'Hall', temperature: 21.5 },
      })),
    })
    const mounted = await tools(client)

    expect(JSON.parse(await execute(mounted.get('home_assistant_get_state'), { entity_id: 'climate.hall' }) as string)).toEqual({
      entityId: 'climate.hall',
      state: 'heat',
      name: 'Hall',
      attributes: { friendly_name: 'Hall', temperature: 21.5 },
    })
  })

  it('passes a parsed data object into the service call', async () => {
    const callService = vi.fn(async () => [{ entity_id: 'light.kitchen', state: 'on' }])
    const mounted = await tools(createClient({ callService }))

    const result = await execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.kitchen',
      data: '{"brightness":200}',
    })

    expect(callService).toHaveBeenCalledWith({
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.kitchen',
      data: { brightness: 200 },
    })
    // Home Assistant answers with the states it changed. The model reads them back.
    expect(JSON.parse(result as string)).toEqual({ changed: [{ entityId: 'light.kitchen', state: 'on' }] })
  })

  it('calls a service without a target entity or data', async () => {
    const callService = vi.fn(async () => [])
    const mounted = await tools(createClient({ callService }))

    await execute(mounted.get('home_assistant_call_service'), { domain: 'script', service: 'good_night' })

    expect(callService).toHaveBeenCalledWith({
      domain: 'script',
      service: 'good_night',
      entityId: undefined,
      data: undefined,
    })
  })

  it('rejects service data that is not a JSON object', async () => {
    const callService = vi.fn(async () => [])
    const mounted = await tools(createClient({ callService }))

    await expect(execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      data: 'not json',
    })).rejects.toThrow('data is not valid JSON')
    await expect(execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      data: '[1,2]',
    })).rejects.toThrow('data must be a JSON object')
    // A malformed payload must never reach Home Assistant.
    expect(callService).not.toHaveBeenCalled()
  })
})
