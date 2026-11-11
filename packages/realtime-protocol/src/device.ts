import { defineEventa } from '@moeru/eventa'

import * as v from 'valibot'

/** An id that one device or one call generates. The length limit bounds the frames that the relay forwards. */
export const IdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64))

/**
 * What a device can do for the other devices of the account.
 *
 * - `call-host`: The device runs the voice runtime and the agent for a call. An endpoint can invite it.
 */
export const DeviceCapabilitySchema = v.picklist(['call-host'])

export type DeviceCapability = v.InferOutput<typeof DeviceCapabilitySchema>

export const DeviceSchema = v.object({
  deviceId: IdSchema,
  kind: v.picklist(['desktop', 'mobile', 'web']),
  /** The name that the device list shows. */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  capabilities: v.pipe(v.array(DeviceCapabilitySchema), v.maxLength(16)),
})

/** One running app of the account that is connected to the message plane. */
export type Device = v.InferOutput<typeof DeviceSchema>

export const DeviceDiscoverSchema = v.object({ from: IdSchema })

export type DeviceDiscover = v.InferOutput<typeof DeviceDiscoverSchema>

export const DeviceLeaveSchema = v.object({ deviceId: IdSchema })

export type DeviceLeave = v.InferOutput<typeof DeviceLeaveSchema>

/** Parses a `device:discover` body from another device. */
export function parseDeviceDiscover(body: unknown): DeviceDiscover {
  return v.parse(DeviceDiscoverSchema, body)
}

/** Parses a `device:announce` body from another device. */
export function parseDevice(body: unknown): Device {
  return v.parse(DeviceSchema, body)
}

/** Parses a `device:leave` body from another device. */
export function parseDeviceLeave(body: unknown): DeviceLeave {
  return v.parse(DeviceLeaveSchema, body)
}

/**
 * Asks every connected device of the account to announce itself.
 *
 * Presence has no server record. A device that needs the list sends this event and collects the answers. A device
 * that loses its connection sends no `deviceLeave`, so a listener must drop a device that stops answering.
 */
export const deviceDiscover = defineEventa<DeviceDiscover>('proj-airi:realtime:device:discover')

/** A device sends this after it connects, after its capabilities change, and as the answer to `deviceDiscover`. */
export const deviceAnnounce = defineEventa<Device>('proj-airi:realtime:device:announce')

/** A device sends this before it closes its connection on purpose. */
export const deviceLeave = defineEventa<DeviceLeave>('proj-airi:realtime:device:leave')
