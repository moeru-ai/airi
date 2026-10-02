import { describe, expect, it } from 'vitest'

import {
  audienceFromBindings,
  audienceIncludes,
  intersectAudiences,
  OWNER_AUDIENCE,
  OWNER_SUBJECT,
  PUBLIC_AUDIENCE,
  subjectAudience,
  unionAudiences,
} from './audience'

const channel = audienceFromBindings(['discord:channel:a'])

describe('audience labels', () => {
  it('derives scene audiences that always include the owner', () => {
    expect(audienceFromBindings()).toEqual(OWNER_AUDIENCE)
    expect(audienceFromBindings(['owner:private'])).toEqual(OWNER_AUDIENCE)
    expect(channel).toEqual(subjectAudience(['discord:channel:a:members', OWNER_SUBJECT]))
  })

  it('lets a run read a record only when the record reaches every subject of the run', () => {
    // A private owner record never reaches a channel run.
    expect(audienceIncludes(OWNER_AUDIENCE, channel)).toBe(false)
    // A channel record reaches the owner and the channel members.
    expect(audienceIncludes(channel, channel)).toBe(true)
    expect(audienceIncludes(channel, OWNER_AUDIENCE)).toBe(true)
    // A public record reaches everyone. A public run reads only public records.
    expect(audienceIncludes(PUBLIC_AUDIENCE, channel)).toBe(true)
    expect(audienceIncludes(channel, PUBLIC_AUDIENCE)).toBe(false)
  })

  it('narrows writes to the intersection and widens outputs to the union', () => {
    const otherChannel = audienceFromBindings(['discord:channel:b'])

    expect(intersectAudiences(channel, OWNER_AUDIENCE)).toEqual(OWNER_AUDIENCE)
    expect(intersectAudiences(channel, otherChannel)).toEqual(OWNER_AUDIENCE)
    expect(intersectAudiences(PUBLIC_AUDIENCE, channel)).toEqual(channel)
    expect(intersectAudiences()).toEqual(PUBLIC_AUDIENCE)
    expect(unionAudiences(channel, otherChannel)).toEqual(subjectAudience(['discord:channel:a:members', 'discord:channel:b:members', OWNER_SUBJECT]))
    expect(unionAudiences(channel, PUBLIC_AUDIENCE)).toEqual(PUBLIC_AUDIENCE)
  })

  it('serializes equal audiences equally', () => {
    expect(JSON.stringify(subjectAudience(['b', 'a', 'b']))).toBe(JSON.stringify(subjectAudience(['a', 'b'])))
  })
})
