import * as v from 'valibot'

export const SatoriUserSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  nick: v.optional(v.string()),
  avatar: v.optional(v.string()),
  is_bot: v.optional(v.boolean()),
})

export const SatoriChannelSchema = v.object({
  id: v.string(),
  type: v.number(),
  name: v.optional(v.string()),
  parent_id: v.optional(v.string()),
})

export const SatoriGuildSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  avatar: v.optional(v.string()),
})

export const SatoriGuildMemberSchema = v.object({
  user: v.optional(SatoriUserSchema),
  nick: v.optional(v.string()),
  avatar: v.optional(v.string()),
  joined_at: v.optional(v.number()),
})

export const SatoriMessageSchema = v.object({
  id: v.string(),
  content: v.string(),
  platform: v.optional(v.string()),
  channel: v.optional(SatoriChannelSchema),
  guild: v.optional(SatoriGuildSchema),
  member: v.optional(SatoriGuildMemberSchema),
  user: v.optional(SatoriUserSchema),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
})

export const SatoriLoginSchema = v.object({
  user: v.optional(SatoriUserSchema),
  self_id: v.optional(v.string()),
  platform: v.optional(v.string()),
  status: v.number(),
  features: v.optional(v.array(v.string())),
  proxy_urls: v.optional(v.array(v.string())),
})

export const SatoriArgvSchema = v.object({
  name: v.string(),
  arguments: v.array(v.unknown()),
  options: v.record(v.string(), v.unknown()),
})

export const SatoriEventSchema = v.object({
  id: v.number(),
  type: v.string(),
  platform: v.string(),
  self_id: v.string(),
  timestamp: v.number(),
  argv: v.optional(SatoriArgvSchema),
  button: v.optional(v.object({ id: v.string() })),
  channel: v.optional(SatoriChannelSchema),
  guild: v.optional(SatoriGuildSchema),
  login: v.optional(SatoriLoginSchema),
  member: v.optional(SatoriGuildMemberSchema),
  message: v.optional(SatoriMessageSchema),
  operator: v.optional(SatoriUserSchema),
  role: v.optional(v.object({ id: v.string(), name: v.optional(v.string()) })),
  user: v.optional(SatoriUserSchema),
  _type: v.optional(v.string()),
  _data: v.optional(v.record(v.string(), v.unknown())),
})

export const SatoriMessageCreateResponseSchema = v.object({
  id: v.string(),
  content: v.optional(v.string()),
  channel: v.optional(SatoriChannelSchema),
  guild: v.optional(SatoriGuildSchema),
  member: v.optional(SatoriGuildMemberSchema),
  user: v.optional(SatoriUserSchema),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
})

export const SatoriReadyBodySchema = v.object({
  logins: v.array(SatoriLoginSchema),
  proxy_urls: v.optional(v.array(v.string())),
})

export const SatoriSignalSchema = v.object({
  op: v.number(),
  body: v.optional(v.unknown()),
})

export const SatoriListSchema = <T extends v.BaseSchema<any, any, any>>(itemSchema: T) => v.object({
  data: v.array(itemSchema),
  next: v.optional(v.string()),
})
