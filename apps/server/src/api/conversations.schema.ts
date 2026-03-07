import { array, literal, number, object, optional, string, union } from 'valibot'

const ChatTypeSchema = union([
  literal('private'),
  literal('bot'),
  literal('group'),
  literal('channel'),
])

const ChatMemberTypeSchema = union([
  literal('user'),
  literal('character'),
  literal('bot'),
])

const ChatMemberRoleSchema = union([
  literal('owner'),
  literal('admin'),
  literal('member'),
])

export const CreateConversationSchema = object({
  type: ChatTypeSchema,
  title: optional(string()),
  members: optional(array(object({
    type: ChatMemberTypeSchema,
    userId: optional(string()),
    characterId: optional(string()),
    role: optional(ChatMemberRoleSchema),
  }))),
})

export const UpdateConversationSchema = object({
  title: optional(string()),
})

export const AddMemberSchema = object({
  type: ChatMemberTypeSchema,
  userId: optional(string()),
  characterId: optional(string()),
  role: optional(ChatMemberRoleSchema),
})

export const MarkReadSchema = object({
  seq: number(),
})
