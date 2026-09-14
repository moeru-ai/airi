import { array, literal, maxLength, minLength, object, optional, pipe, string, union } from 'valibot'

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

// TODO: Encode member invariants directly in schema:
// - type === 'user' requires userId
// - non-user member types require characterId
export const CreateChatSchema = object({
  id: optional(pipe(string(), minLength(1), maxLength(30))),
  type: optional(ChatTypeSchema),
  title: optional(string()),
  members: optional(array(object({
    type: ChatMemberTypeSchema,
    userId: optional(string()),
    characterId: optional(string()),
  }))),
})

export const UpdateChatSchema = object({
  title: optional(string()),
})

// TODO: Promote the same discriminated validation rules to AddMemberSchema so invalid combinations fail as 4xx at the HTTP boundary.
export const AddMemberSchema = object({
  type: ChatMemberTypeSchema,
  userId: optional(string()),
  characterId: optional(string()),
})
