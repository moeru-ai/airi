import { array, literal, number, object, optional, string, union } from 'valibot'

const MessageRoleSchema = union([
  literal('system'),
  literal('user'),
  literal('assistant'),
  literal('tool'),
  literal('error'),
])

export const SendMessageSchema = object({
  id: string(),
  role: MessageRoleSchema,
  content: string(),
  parentId: optional(string()),
  createdAt: optional(number()),
})

export const SendMessagesSchema = object({
  messages: array(SendMessageSchema),
})

export const EditMessageSchema = object({
  content: string(),
})
