import * as v from 'valibot'

export const SatoriUserSchema = v.object({
  avatar: v.optional(v.string()),
  id: v.string(),
  is_bot: v.optional(v.boolean()),
  name: v.optional(v.string()),
  nick: v.optional(v.string()),
})

export const SatoriChannelSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  parent_id: v.optional(v.string()),
  type: v.number(),
})

export const SatoriGuildSchema = v.object({
  avatar: v.optional(v.string()),
  id: v.string(),
  name: v.optional(v.string()),
})

export const SatoriGuildMemberSchema = v.object({
  avatar: v.optional(v.string()),
  joined_at: v.optional(v.number()),
  nick: v.optional(v.string()),
  user: v.optional(SatoriUserSchema),
})

export const SatoriMessageSchema = v.object({
  channel: v.optional(SatoriChannelSchema),
  content: v.string(),
  created_at: v.optional(v.number()),
  guild: v.optional(SatoriGuildSchema),
  id: v.string(),
  member: v.optional(SatoriGuildMemberSchema),
  platform: v.optional(v.string()),
  updated_at: v.optional(v.number()),
  user: v.optional(SatoriUserSchema),
})

export const SatoriLoginSchema = v.object({
  features: v.optional(v.array(v.string())),
  platform: v.optional(v.string()),
  proxy_urls: v.optional(v.array(v.string())),
  self_id: v.optional(v.string()),
  status: v.number(),
  user: v.optional(SatoriUserSchema),
})

export const SatoriArgvSchema = v.object({
  arguments: v.array(v.unknown()),
  name: v.string(),
  options: v.record(v.string(), v.unknown()),
})

export const SatoriEventSchema = v.object({
  _data: v.optional(v.record(v.string(), v.unknown())),
  _type: v.optional(v.string()),
  argv: v.optional(SatoriArgvSchema),
  button: v.optional(v.object({ id: v.string() })),
  channel: v.optional(SatoriChannelSchema),
  guild: v.optional(SatoriGuildSchema),
  id: v.number(),
  login: v.optional(SatoriLoginSchema),
  member: v.optional(SatoriGuildMemberSchema),
  message: v.optional(SatoriMessageSchema),
  operator: v.optional(SatoriUserSchema),
  platform: v.string(),
  role: v.optional(v.object({ id: v.string(), name: v.optional(v.string()) })),
  self_id: v.string(),
  timestamp: v.number(),
  type: v.string(),
  user: v.optional(SatoriUserSchema),
})

export const SatoriMessageCreateResponseSchema = v.object({
  channel: v.optional(SatoriChannelSchema),
  content: v.optional(v.string()),
  created_at: v.optional(v.number()),
  guild: v.optional(SatoriGuildSchema),
  id: v.string(),
  member: v.optional(SatoriGuildMemberSchema),
  updated_at: v.optional(v.number()),
  user: v.optional(SatoriUserSchema),
})

export const SatoriReadyBodySchema = v.object({
  logins: v.array(SatoriLoginSchema),
  proxy_urls: v.optional(v.array(v.string())),
})

export const SatoriSignalSchema = v.object({
  body: v.optional(v.unknown()),
  op: v.number(),
})

export function SatoriListSchema<T extends v.BaseSchema<any, any, any>>(itemSchema: T) {
  return v.object({
    data: v.array(itemSchema),
    next: v.optional(v.string()),
  })
}
