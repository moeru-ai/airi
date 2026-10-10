import type { HomeAssistantClient } from '../libs/home-assistant/client'
import type { HomeAssistantExposure } from '../libs/home-assistant/exposure'

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

const allow = (...entityIds: string[]): HomeAssistantExposure => ({ mode: 'allow', entityIds })
const deny = (...entityIds: string[]): HomeAssistantExposure => ({ mode: 'deny', entityIds })

async function tools(client: HomeAssistantClient, options?: { entityLimit?: number, exposure?: HomeAssistantExposure }) {
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

  it('calls a service on a script entity with no extra data', async () => {
    const callService = vi.fn(async () => [])
    const mounted = await tools(createClient({ callService }))

    await execute(mounted.get('home_assistant_call_service'), {
      domain: 'script',
      service: 'turn_on',
      entity_id: 'script.good_night',
    })

    expect(callService).toHaveBeenCalledWith({
      domain: 'script',
      service: 'turn_on',
      entityId: 'script.good_night',
      data: undefined,
    })
  })

  it('requires a target entity, so no call reaches a whole domain', async () => {
    const mounted = await tools(createClient())

    const parameters = mounted.get('home_assistant_call_service')?.function.parameters as {
      required?: string[]
    }

    expect(parameters.required).toContain('entity_id')
  })

  it('rejects service data that is not a JSON object', async () => {
    const callService = vi.fn(async () => [])
    const mounted = await tools(createClient({ callService }))

    await expect(execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.kitchen',
      data: 'not json',
    })).rejects.toThrow('data is not valid JSON')
    await expect(execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.kitchen',
      data: '[1,2]',
    })).rejects.toThrow('data must be a JSON object')
    // A malformed payload must never reach Home Assistant.
    expect(callService).not.toHaveBeenCalled()
  })

  it('handles service responses that are not state arrays', async () => {
    const callService = vi.fn(async () => 'ok')
    const mounted = await tools(createClient({ callService }))

    const result = await execute(mounted.get('home_assistant_call_service'), {
      domain: 'script',
      service: 'turn_on',
      entity_id: 'script.good_night',
    })

    expect(JSON.parse(result as string)).toEqual({ changed: [] })
  })

  it('filters out malformed state entries from service response', async () => {
    const callService = vi.fn(async () => [
      { entity_id: 'light.kitchen', state: 'on' },
      { entity_id: 'light.invalid' }, // missing state
      'invalid', // not an object
      { state: 'on' }, // missing entity_id
    ])
    const mounted = await tools(createClient({ callService }))

    const result = await execute(mounted.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.kitchen',
    })

    expect(JSON.parse(result as string)).toEqual({
      changed: [{ entityId: 'light.kitchen', state: 'on' }],
    })
  })

  it('hides a blocked device from a listing and reports how many it hid', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => [
        { entityId: 'light.kitchen', state: 'on', attributes: {} },
        { entityId: 'lock.front_door', state: 'locked', attributes: {} },
      ]),
    })
    const mounted = await tools(client, { exposure: allow('light.kitchen') })

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), {}) as string)

    expect(result.entities).toEqual([{ entityId: 'light.kitchen', state: 'on' }])
    expect(result.total).toBe(1)
    // The model must know that the list is partial, or it reports that the user
    // owns no lock.
    expect(result.note).toContain('1 entity is not on the user\'s allow list')
  })

  it('reports the blocked list rather than the allow list under "deny"', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => [
        { entityId: 'light.kitchen', state: 'on', attributes: {} },
        { entityId: 'lock.front_door', state: 'locked', attributes: {} },
      ]),
    })
    const mounted = await tools(client, { exposure: deny('lock.front_door') })

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), {}) as string)

    expect(result.entities.map((entry: { entityId: string }) => entry.entityId)).toEqual(['light.kitchen'])
    expect(result.note).toContain('1 entity is on the user\'s blocked list')
  })

  it('treats a domain as a browse filter, not as a permission', async () => {
    // A device the user blocked under one domain must not turn the whole domain
    // into a refusal. Another device of that domain is still listed.
    const client = createClient({
      listEntities: vi.fn(async () => [
        { entityId: 'light.kitchen', state: 'on', attributes: {} },
        { entityId: 'light.hall', state: 'off', attributes: {} },
      ]),
    })
    const mounted = await tools(client, { exposure: allow('light.hall') })

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), { domain: 'light' }) as string)

    expect(result.entities).toEqual([{ entityId: 'light.hall', state: 'off' }])
  })

  it('returns nothing for a domain whose devices are all blocked', async () => {
    const client = createClient({
      listEntities: vi.fn(async () => [{ entityId: 'lock.front_door', state: 'locked', attributes: {} }]),
    })
    const mounted = await tools(client, { exposure: allow('light.kitchen') })

    const result = JSON.parse(await execute(mounted.get('home_assistant_list_entities'), { domain: 'lock' }) as string)

    expect(result.entities).toEqual([])
    expect(result.note).toContain('not on the user\'s allow list')
  })

  it('refuses to read or control a device the user blocked', async () => {
    const client = createClient({
      getState: vi.fn(async () => ({ entityId: 'lock.front_door', state: 'locked', attributes: {} })),
    })
    const mounted = await tools(client, { exposure: deny('lock.front_door') })

    await expect(execute(mounted.get('home_assistant_get_state'), { entity_id: 'lock.front_door' }))
      .rejects
      .toThrow('The user blocks this device')
    await expect(execute(mounted.get('home_assistant_call_service'), {
      domain: 'lock',
      service: 'unlock',
      entity_id: 'lock.front_door',
    })).rejects.toThrow('The user blocks this device')

    // A blocked call must never leave the process.
    expect(client.getState).not.toHaveBeenCalled()
    expect(client.callService).not.toHaveBeenCalled()
  })

  it('names the device when an allow list excludes it', async () => {
    const mounted = await tools(createClient(), { exposure: allow('light.kitchen') })

    await expect(execute(mounted.get('home_assistant_get_state'), { entity_id: 'light.hall' }))
      .rejects
      .toThrow('Entity "light.hall" is not available')
  })

  it('reaches a device the allow list names, and every device under "all"', async () => {
    const hallService = vi.fn(async () => [])
    const allowed = await tools(createClient({ callService: hallService }), { exposure: allow('light.hall') })

    await execute(allowed.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.hall',
    })
    expect(hallService).toHaveBeenCalled()

    const blocked = await tools(createClient({ callService: vi.fn(async () => []) }), { exposure: allow('light.kitchen') })
    await expect(execute(blocked.get('home_assistant_call_service'), {
      domain: 'light',
      service: 'turn_on',
      entity_id: 'light.hall',
    })).rejects.toThrow('is not available')
  })

  it('states the policy in every tool description', async () => {
    const allowing = await tools(createClient(), { exposure: allow('light.kitchen') })
    for (const entry of allowing.values())
      expect(entry.function.description).toContain('The user exposes only 1 chosen device.')

    const denying = await tools(createClient(), { exposure: deny('lock.front_door', 'cover.garage') })
    for (const entry of denying.values())
      expect(entry.function.description).toContain('The user blocks 2 devices.')
  })
})
