import type { HomeAssistantTransport } from './client'

import { describe, expect, it, vi } from 'vitest'

import { createHomeAssistantClient, HomeAssistantError } from './client'

function transportReturning(value: unknown): HomeAssistantTransport & ReturnType<typeof vi.fn> {
  return vi.fn(async () => value) as HomeAssistantTransport & ReturnType<typeof vi.fn>
}

describe('home assistant client', () => {
  it('maps the reported entity shape into the client shape', async () => {
    const transport = transportReturning([
      {
        entity_id: 'light.kitchen',
        state: 'on',
        attributes: { friendly_name: 'Kitchen', brightness: 120 },
        last_changed: '2026-10-06T10:00:00.000000+00:00',
      },
    ])

    const client = createHomeAssistantClient(transport)
    expect(await client.listEntities()).toEqual([
      {
        entityId: 'light.kitchen',
        state: 'on',
        attributes: { friendly_name: 'Kitchen', brightness: 120 },
        lastChanged: '2026-10-06T10:00:00.000000+00:00',
      },
    ])
    expect(transport).toHaveBeenCalledWith({ path: '/api/states', method: 'GET', signal: undefined })
  })

  it('reads an entity that reports no attributes', async () => {
    const transport = transportReturning([{ entity_id: 'switch.pump', state: 'off' }])

    const client = createHomeAssistantClient(transport)
    expect((await client.listEntities())[0]).toEqual({
      entityId: 'switch.pump',
      state: 'off',
      attributes: {},
    })
  })

  it('joins the entity id into the service call body', async () => {
    const transport = transportReturning([])

    const client = createHomeAssistantClient(transport)
    await client.callService({
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.kitchen',
      data: { brightness: 200 },
    })

    expect(transport).toHaveBeenCalledWith({
      path: '/api/services/light/turn_on',
      method: 'POST',
      body: { brightness: 200, entity_id: 'light.kitchen' },
      signal: undefined,
    })
  })

  it('rejects a call that names no target', async () => {
    const transport = transportReturning([])
    const client = createHomeAssistantClient(transport)

    await expect(client.callService({ domain: 'script', service: 'good_night', entityId: undefined as unknown as string }))
      .rejects
      .toThrow('is not a valid Home Assistant entity id')
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects a list of targets, because a caller checks one string', async () => {
    // Home Assistant reads "light.kitchen,lock.front_door" as two targets and
    // acts on both. A caller that compares the string against its allow list
    // sees only the first entry.
    const transport = transportReturning([])
    const client = createHomeAssistantClient(transport)

    await expect(client.callService({
      domain: 'homeassistant',
      service: 'turn_off',
      entityId: 'light.kitchen,lock.front_door',
    })).rejects.toThrow('is not a valid Home Assistant entity id')
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects a target hidden in the extra data', async () => {
    const transport = transportReturning([])
    const client = createHomeAssistantClient(transport)

    for (const key of ['entity_id', 'target', 'device_id', 'area_id', 'floor_id', 'label_id']) {
      await expect(client.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.kitchen',
        data: { [key]: 'lock.front_door' },
      })).rejects.toThrow(`may not carry "${key}"`)
    }
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects a service name that is not a Home Assistant slug', async () => {
    const transport = transportReturning([])
    const client = createHomeAssistantClient(transport)

    await expect(client.callService({ domain: 'light', service: '../shell_command', entityId: 'light.kitchen' }))
      .rejects
      .toThrow(HomeAssistantError)
    await expect(client.callService({ domain: 'Light', service: 'turn_on', entityId: 'light.kitchen' }))
      .rejects
      .toThrow('"Light" is not a valid Home Assistant service domain.')
    // The request must not leave the client when the address is not valid.
    expect(transport).not.toHaveBeenCalled()
  })

  it('reports a state list that does not match the expected shape', async () => {
    const client = createHomeAssistantClient(transportReturning({ entities: [] }))

    await expect(client.listEntities()).rejects.toThrow('Home Assistant returned an unexpected state list.')
  })

  it('keeps the transport failure as the cause', async () => {
    const failure = new Error('connection refused')
    const client = createHomeAssistantClient(vi.fn(async () => {
      throw failure
    }))

    await expect(client.listEntities()).rejects.toThrow(failure)
  })

  it('passes the abort signal to the transport', async () => {
    const transport = transportReturning([])
    const controller = new AbortController()

    const client = createHomeAssistantClient(transport)
    await client.listEntities(controller.signal)

    expect(transport).toHaveBeenCalledWith({
      path: '/api/states',
      method: 'GET',
      signal: controller.signal,
    })
  })

  it('reads one entity by id', async () => {
    const transport = transportReturning({
      entity_id: 'light.living_room',
      state: 'on',
      attributes: { friendly_name: 'Living room' },
    })

    const client = createHomeAssistantClient(transport)
    expect(await client.getState('light.living_room')).toEqual({
      entityId: 'light.living_room',
      state: 'on',
      attributes: { friendly_name: 'Living room' },
    })
    expect(transport).toHaveBeenCalledWith({
      path: '/api/states/light.living_room',
      method: 'GET',
      signal: undefined,
    })
  })

  it('rejects an entity id that is not a Home Assistant entity id', async () => {
    const transport = transportReturning({})
    const client = createHomeAssistantClient(transport)

    await expect(client.getState('light'))
      .rejects
      .toThrow('"light" is not a valid Home Assistant entity id.')
    await expect(client.getState('../secrets'))
      .rejects
      .toThrow(HomeAssistantError)
    // The request must not leave the client when the address is not valid.
    expect(transport).not.toHaveBeenCalled()
  })

  it('reports a state that does not match the expected shape', async () => {
    const client = createHomeAssistantClient(transportReturning(['light.kitchen']))

    await expect(client.getState('light.kitchen'))
      .rejects
      .toThrow('Home Assistant returned an unexpected state for "light.kitchen".')
  })
})
